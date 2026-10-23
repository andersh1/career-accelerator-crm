/**
 * Cron: generate proactive CRM notifications
 * Schedule: every day at 8 AM UTC  ("0 8 * * *")
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSlack, coldLeadBlocks } from "@/lib/slack";
import { ACTIVE_STAGES, NON_PARTICIPANT_TYPES } from "@/components/crm/constants";

/**
 * Who is worth chasing.
 *
 * This used to be a denylist — every stage except ENROLLED and LOST — and it
 * swept up everyone the programme was already finished with. On 23 Oct 2026 all
 * eleven "cold leads" were people nobody should have been chasing: two
 * graduated, three withdrawn, one declined, two keeping in touch, and three
 * soft-deleted test records that the query never checked for.
 *
 * An allowlist cannot fail that way. ACTIVE_STAGES is the live pipeline, so a
 * stage nobody anticipated stays out until someone decides it belongs in.
 *
 * leadType is matched with an OR because the column is nullable: a bare notIn
 * evaluates to NULL for a null leadType and silently drops those leads.
 */
const CHASEABLE = {
  deletedAt: null,
  stage: { in: [...ACTIVE_STAGES] as string[] },
  OR: [
    { leadType: null },
    { leadType: { notIn: Array.from(NON_PARTICIPANT_TYPES) } },
  ],
};

function authOk(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Load automation toggle settings once — default to enabled if not set
  const settingKeys = ["automation.stale-escalation", "automation.stale-notification", "automation.proposal-followup"];
  const settingRows = await prisma.appSetting.findMany({ where: { key: { in: settingKeys } } });
  const settingMap  = Object.fromEntries(settingRows.map(s => [s.key, s.value]));
  const isOn = (key: string) => settingMap[key] !== "false";

  const now          = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const yesterday    = new Date(now.getTime() - 86400000);
  let created = 0;

  /**
   * 1. Overdue tasks — ONE digest a day, not one row per task.
   *
   * A row per task per day is how TASK_OVERDUE reached 1,047 notifications and
   * became 69% of the whole feed. Twenty-two open tasks produced twenty-two
   * notifications every morning, which is not twenty-two pieces of news; it is
   * one piece of news repeated. The tasks page already lists them, so the feed
   * only has to say how many and point there.
   *
   * Note this does NOT use CHASEABLE. A task is a commitment a person made, not
   * an inference the cron drew, and the stage filter would have silently hidden
   * sixteen of today's twenty-two — including follow-ups on deals now marked
   * Lost, which need closing rather than concealing. Only a deleted lead is
   * excluded, because that record is gone. The digest solves the volume; it
   * does not need to solve it by dropping work.
   */
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const overdueTasks = await prisma.task.findMany({
    where: { completedAt: null, dueAt: { lt: yesterday }, lead: { deletedAt: null } },
    select: { leadId: true, dueAt: true },
    orderBy: { dueAt: "asc" },
  });

  if (overdueTasks.length > 0) {
    const alreadyToday = await prisma.cRMNotification.findFirst({
      where: { type: "TASK_OVERDUE", createdAt: { gte: todayStart } },
    });
    const people  = new Set(overdueTasks.map(t => t.leadId)).size;
    const oldest  = overdueTasks[0].dueAt;
    const days    = oldest ? Math.floor((now.getTime() - oldest.getTime()) / 86400000) : 0;

    if (!alreadyToday) {
      await prisma.cRMNotification.create({
        data: {
          type:  "TASK_OVERDUE",
          title: overdueTasks.length === 1
            ? "1 task is overdue"
            : `${overdueTasks.length} tasks are overdue`,
          body:  `Across ${people} ${people === 1 ? "lead" : "leads"} · oldest ${days} ${days === 1 ? "day" : "days"} past due`,
          href:  `/tasks`,
        },
      });
      created++;
    }
  }

  /**
   * 2. Live leads gone cold.
   *
   * Two changes beyond CHASEABLE, both aimed at the same fault: the rule used
   * to feed itself.
   *
   * It escalated every cold HIGH lead to URGENT, and the query selects HIGH and
   * URGENT — so the cron promoted leads into its own search results and then
   * told you about them every morning for ever. Twenty of ninety-five leads sat
   * at URGENT, almost all of them put there by this code, which is how URGENT
   * stopped meaning anything. Escalation now stops at HIGH and only lifts a
   * NORMAL lead, so URGENT stays a judgement a person made.
   *
   * And the reminder repeats weekly rather than daily. A lead that has been
   * quiet for forty days is not forty pieces of news.
   */
  const coldLeads = await prisma.lead.findMany({
    where: {
      ...CHASEABLE,
      updatedAt: { lt: sevenDaysAgo },
      priority:  { in: ["HIGH", "URGENT"] },
    },
    select: { id: true, firstName: true, lastName: true, stage: true, updatedAt: true, priority: true },
    orderBy: { updatedAt: "asc" },
    take: 25,
  });

  for (const lead of coldLeads) {
    const existing = await prisma.cRMNotification.findFirst({
      where: { type: "LEAD_COLD", leadId: lead.id, createdAt: { gte: sevenDaysAgo } },
    });
    if (existing) continue;

    const daysStale = Math.floor((now.getTime() - lead.updatedAt.getTime()) / 86400000);
    const name = `${lead.firstName} ${lead.lastName}`;

    // One notch, and only from NORMAL. Never to URGENT, and never past HIGH.
    const escalated = isOn("automation.stale-escalation") && lead.priority === "NORMAL";
    if (escalated) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { priority: "HIGH" },
      });
      await prisma.leadActivity.create({
        data: {
          leadId:  lead.id,
          type:    "NOTE",
          content: "Auto-raised to HIGH: 7+ days without contact",
        },
      });
    }

    // CRM notification + Slack (gated by stale-notification toggle)
    if (isOn("automation.stale-notification")) {
      await prisma.cRMNotification.create({
        data: {
          type:   "LEAD_COLD",
          title:  `${name} hasn't been touched in ${daysStale} days`,
          // The old body always read "auto-escalated to URGENT", whether or not
          // anything had been escalated. Say what the lead is instead.
          body:   `${lead.stage.toLowerCase().replace(/_/g, " ")} · no contact in ${daysStale} days`,
          leadId: lead.id,
          href:   `/leads/${lead.id}`,
        },
      });
      const { text, blocks } = coldLeadBlocks(name, lead.id, daysStale);
      await sendSlack(text, blocks);
    }
    created++;
  }

  // 3. OFFER_SENT-stage leads untouched for 5+ days (gated by proposal-followup toggle)
  if (isOn("automation.proposal-followup")) {
    const fiveDaysAgo = new Date(now.getTime() - 5 * 86400000);
    const staleOffers = await prisma.lead.findMany({
      where: {
        ...CHASEABLE,
        stage:     "OFFER_SENT",
        updatedAt: { lt: fiveDaysAgo },
      },
      select: { id: true, firstName: true, lastName: true, updatedAt: true },
      take: 25,
    });

    for (const lead of staleOffers) {
      // An offer out for weeks is one reminder a week, not one a day.
      const existing = await prisma.cRMNotification.findFirst({
        where: { type: "OFFER_STALE", leadId: lead.id, createdAt: { gte: sevenDaysAgo } },
      });
      if (existing) continue;

      const name = `${lead.firstName} ${lead.lastName}`;
      await prisma.cRMNotification.create({
        data: {
          type:   "OFFER_STALE",
          title:  `Follow up with ${name} — offer has been out for 5 days`,
          body:   `Offer sent but no movement — check in to keep momentum`,
          leadId: lead.id,
          href:   `/leads/${lead.id}`,
        },
      });
      created++;
    }
  }

  return NextResponse.json({ created });
}
