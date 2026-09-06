import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSlack, enrolledBlocks } from "@/lib/slack";
import { fireWebhook } from "@/lib/webhooks";
import { sendOutcomeFollowUpEmail } from "@/lib/email";

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { role?: string } }).user?.role !== "ADMIN";
}
function requireCrmAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return requireAdmin(session) || (session as { user?: { crmRole?: string } }).user?.crmRole !== "ADMIN";
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      activities: { orderBy: { createdAt: "desc" } },
      enrolledUser: { select: { id: true, name: true, email: true, cohort: true } },
    },
  });

  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(lead);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { stage: newStage, notesAppend, ...rest } = body;

  const existing = await prisma.lead.findUnique({ where: { id: params.id }, select: { stage: true, notes: true, outcomeEmailSentAt: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Whitelist patchable fields to prevent mass-assignment
  const ALLOWED = new Set(["firstName","lastName","email","phone","company","jobTitle","source","subSource","leadType","priority","paymentStatus","dealValue","assignedTo","tags","notes","lostReason","lostCategory","unsubscribed","enrolledUserId","outcomeStatus","outcomeCompany","outcomeRole","outcomeSalary","outcomeStartDate","outcomeNotes","outcomeUpdatedAt"]);
  const data: Record<string, unknown> = Object.fromEntries(
    Object.entries(rest).filter(([k]) => ALLOWED.has(k))
  );
  if (newStage) data.stage = newStage;
  // Append to notes rather than overwrite
  if (notesAppend) {
    data.notes = existing.notes
      ? `${existing.notes}\n\n[AI from transcript] ${notesAppend}`
      : `[AI from transcript] ${notesAppend}`;
  }

  const lead = await prisma.lead.update({
    where: { id: params.id },
    data,
    select: {
      firstName: true, lastName: true, email: true,
      stage: true, dealValue: true,
      outcomeStatus: true, outcomeEmailSentAt: true,
    },
  });

  if (newStage && newStage !== existing.stage) {
    await prisma.leadActivity.create({
      data: {
        leadId:    params.id,
        type:      "STAGE_CHANGE",
        content:   `Moved from ${existing.stage} to ${newStage}`,
        metadata:  JSON.stringify({ from: existing.stage, to: newStage }),
        createdBy: (session as { user: { id: string } }).user.id,
      },
    });

    // Webhook: stage changed (fire-and-forget)
    fireWebhook("lead.stage_changed", {
      leadId:    params.id,
      firstName: lead.firstName,
      lastName:  lead.lastName,
      email:     lead.email,
      fromStage: existing.stage,
      toStage:   newStage,
    }).catch(() => {});

    // Slack + CRM notification on enrollment
    if (newStage === "ENROLLED") {
      const fullLead = await prisma.lead.findUnique({
        where: { id: params.id },
        select: { firstName: true, lastName: true, dealValue: true },
      });
      if (fullLead) {
        const name = `${fullLead.firstName} ${fullLead.lastName}`;
        const { text, blocks } = enrolledBlocks(name, params.id, fullLead.dealValue ?? null);
        await sendSlack(text, blocks);
        await prisma.cRMNotification.create({
          data: {
            type:   "LEAD_ENROLLED",
            title:  `🎉 ${name} enrolled!`,
            body:   fullLead.dealValue ? `Deal value: $${fullLead.dealValue.toLocaleString()}` : undefined,
            leadId: params.id,
            href:   `/leads/${params.id}`,
          },
        });
        // Webhook: lead enrolled (fire-and-forget)
        fireWebhook("lead.enrolled", {
          leadId:    params.id,
          firstName: fullLead.firstName,
          lastName:  fullLead.lastName,
          email:     lead.email,
          dealValue: fullLead.dealValue ?? null,
        }).catch(() => {});
      }
    }

    // ── Outcomes follow-up: send email when graduated (stage → COMPLETED) ──
    if (newStage === "COMPLETED" && !lead.outcomeEmailSentAt) {
      (async () => {
        try {
          const token = crypto.randomUUID();
          await prisma.lead.update({
            where: { id: params.id },
            data: {
              outcomeToken:       token,
              outcomeEmailSentAt: new Date(),
              outcomeStatus:      lead.outcomeStatus ?? "PENDING",
            },
          });
          await sendOutcomeFollowUpEmail({ to: lead.email, firstName: lead.firstName, token });
        } catch { /* non-fatal */ }
      })();
    }

    // ── Automation: stage-change triggers (fire-and-forget, toggle-gated) ──
    const stageTriggers = async () => {
      const toggleKeys = ["automation.qualified-trigger", "automation.proposal-trigger", "automation.enrolled-trigger"];
      const rows = await prisma.appSetting.findMany({ where: { key: { in: toggleKeys } } });
      const on = (key: string) => Object.fromEntries(rows.map(r => [r.key, r.value]))[key] !== "false";

      if (newStage === "STRATEGY_CALL" && on("automation.qualified-trigger")) {
        await prisma.leadActivity.create({
          data: {
            leadId:  params.id,
            type:    "NOTE",
            content: "📋 Strategy call scheduled — send offer within 48 hours if they're a fit",
          },
        });
      } else if (newStage === "OFFER_SENT" && on("automation.proposal-trigger")) {
        const fullLead = await prisma.lead.findUnique({
          where: { id: params.id },
          select: { firstName: true, lastName: true },
        });
        if (fullLead) {
          await prisma.cRMNotification.create({
            data: {
              type:   "OFFER_SENT",
              title:  `Offer sent to ${fullLead.firstName} ${fullLead.lastName} — follow up in 3 days`,
              body:   "Keep the momentum going with a timely follow-up",
              leadId: params.id,
              href:   `/leads/${params.id}`,
            },
          });
        }
      } else if (newStage === "ENROLLED" && on("automation.enrolled-trigger")) {
        await prisma.leadActivity.create({
          data: {
            leadId:  params.id,
            type:    "NOTE",
            content: "🎉 Enrolled! Remember to introduce them to the student community",
          },
        });
      }
    };
    stageTriggers().catch(() => {});
  }

  return NextResponse.json(lead);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (requireCrmAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Soft delete — moves to recycle bin; use ?permanent=true to hard delete
  const permanent = new URL(req.url).searchParams.get("permanent") === "true";
  try {
    if (permanent) {
      await prisma.lead.delete({ where: { id: params.id } });
    } else {
      await prisma.lead.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    }
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "P2025") return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}
