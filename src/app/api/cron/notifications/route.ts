/**
 * Cron: generate proactive CRM notifications
 * Schedule: every day at 8 AM UTC  ("0 8 * * *")
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSlack, coldLeadBlocks } from "@/lib/slack";

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

  // 1. Overdue tasks — only notify once per task per day
  const overdueTasks = await prisma.task.findMany({
    where: { completedAt: null, dueAt: { lt: yesterday } },
    include: { lead: { select: { id: true, firstName: true, lastName: true } } },
    take: 20,
  });

  for (const task of overdueTasks) {
    // Check if we already notified about this task today
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const existing   = await prisma.cRMNotification.findFirst({
      where: {
        type:      "TASK_OVERDUE",
        leadId:    task.leadId,
        title:     { contains: task.title },
        createdAt: { gte: todayStart },
      },
    });
    if (existing) continue;

    await prisma.cRMNotification.create({
      data: {
        type:   "TASK_OVERDUE",
        title:  `Overdue: "${task.title}"`,
        body:   `${task.lead.firstName} ${task.lead.lastName} — due ${task.dueAt?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        leadId: task.leadId,
        href:   `/leads/${task.leadId}`,
      },
    });
    created++;
  }

  // 2. High-score leads gone cold (not touched in 7+ days, stage != ENROLLED/LOST)
  //    Improvement: also auto-escalate priority to URGENT and log a LeadActivity
  const coldLeads = await prisma.lead.findMany({
    where: {
      stage:     { notIn: ["ENROLLED", "LOST"] },
      updatedAt: { lt: sevenDaysAgo },
      priority:  { in: ["HIGH", "URGENT"] },
    },
    select: { id: true, firstName: true, lastName: true, stage: true, updatedAt: true, priority: true },
    take: 10,
  });

  for (const lead of coldLeads) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const existing   = await prisma.cRMNotification.findFirst({
      where: { type: "LEAD_COLD", leadId: lead.id, createdAt: { gte: todayStart } },
    });
    if (existing) continue;

    const daysStale = Math.floor((now.getTime() - lead.updatedAt.getTime()) / 86400000);
    const name = `${lead.firstName} ${lead.lastName}`;

    // Auto-escalate to URGENT only if not already URGENT (prevents duplicate notes)
    if (isOn("automation.stale-escalation") && lead.priority !== "URGENT") {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { priority: "URGENT" },
      });
      await prisma.leadActivity.create({
        data: {
          leadId:  lead.id,
          type:    "NOTE",
          content: "⚠️ Auto-escalated to URGENT: 7+ days without contact",
        },
      });
    }

    // CRM notification + Slack (gated by stale-notification toggle)
    if (isOn("automation.stale-notification")) {
      await prisma.cRMNotification.create({
        data: {
          type:   "LEAD_COLD",
          title:  `${name} hasn't been touched in ${daysStale} days`,
          body:   `High-priority lead — auto-escalated to URGENT`,
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
        stage:     "OFFER_SENT",
        updatedAt: { lt: fiveDaysAgo },
      },
      select: { id: true, firstName: true, lastName: true, updatedAt: true },
      take: 10,
    });

    for (const lead of staleOffers) {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const existing   = await prisma.cRMNotification.findFirst({
        where: { type: "OFFER_STALE", leadId: lead.id, createdAt: { gte: todayStart } },
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
