import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSlack, enrolledBlocks } from "@/lib/slack";
import { fireWebhook } from "@/lib/webhooks";

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

  const existing = await prisma.lead.findUnique({ where: { id: params.id }, select: { stage: true, notes: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = { ...rest };
  if (newStage) data.stage = newStage;
  // Append to notes rather than overwrite
  if (notesAppend) {
    data.notes = existing.notes
      ? `${existing.notes}\n\n[AI from transcript] ${notesAppend}`
      : `[AI from transcript] ${notesAppend}`;
  }

  const lead = await prisma.lead.update({ where: { id: params.id }, data });

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

    // ── Automation: stage-change triggers (fire-and-forget) ──
    const stageTriggers = async () => {
      if (newStage === "QUALIFIED") {
        await prisma.leadActivity.create({
          data: {
            leadId:  params.id,
            type:    "NOTE",
            content: "📋 Lead qualified — consider sending proposal within 48 hours",
          },
        });
      } else if (newStage === "PROPOSAL") {
        const fullLead = await prisma.lead.findUnique({
          where: { id: params.id },
          select: { firstName: true, lastName: true },
        });
        if (fullLead) {
          await prisma.cRMNotification.create({
            data: {
              type:   "PROPOSAL_SENT",
              title:  `New proposal out to ${fullLead.firstName} ${fullLead.lastName} — follow up in 3 days`,
              body:   "Keep the momentum going with a timely follow-up",
              leadId: params.id,
              href:   `/leads/${params.id}`,
            },
          });
        }
      } else if (newStage === "ENROLLED") {
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
  if (permanent) {
    await prisma.lead.delete({ where: { id: params.id } });
  } else {
    await prisma.lead.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
  }
  return NextResponse.json({ ok: true });
}
