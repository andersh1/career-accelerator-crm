/**
 * Cron: process email sequence steps
 * Schedule: every day at 9 AM UTC  ("0 9 * * *")
 * Auth:     Vercel sets Authorization: Bearer <CRON_SECRET>
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSequenceEmail } from "@/lib/email";

function authOk(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — allow (dev)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();

  // Find all ACTIVE enrollments that are due
  const due = await prisma.emailSequenceEnrollment.findMany({
    where: { status: "ACTIVE", nextSendAt: { lte: now } },
    include: {
      lead:     { select: { id: true, firstName: true, lastName: true, email: true } },
      sequence: { include: { steps: { orderBy: { stepNumber: "asc" } } } },
    },
  });

  let sent = 0; let errors = 0;

  for (const enrollment of due) {
    const step = enrollment.sequence.steps.find(s => s.stepNumber === enrollment.currentStep);
    if (!step) {
      // No step found — mark complete
      await prisma.emailSequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "COMPLETED", completedAt: now },
      });
      continue;
    }

    const fullName = `${enrollment.lead.firstName} ${enrollment.lead.lastName}`;
    const result   = await sendSequenceEmail({
      to: enrollment.lead.email, subject: step.subject,
      body: step.body, leadName: fullName,
    });

    if (result.ok) {
      // Log activity
      await prisma.leadActivity.create({
        data: {
          leadId:  enrollment.lead.id,
          type:    "EMAIL",
          content: `[Sequence: ${enrollment.sequence.name}] Step ${step.stepNumber}: ${step.subject}`,
        },
      });

      const nextStep = enrollment.sequence.steps.find(s => s.stepNumber === enrollment.currentStep + 1);
      if (nextStep) {
        await prisma.emailSequenceEnrollment.update({
          where:  { id: enrollment.id },
          data: {
            currentStep: nextStep.stepNumber,
            nextSendAt:  new Date(now.getTime() + nextStep.delayDays * 86400000),
          },
        });
      } else {
        // Last step — complete
        await prisma.emailSequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "COMPLETED", completedAt: now },
        });
        await prisma.cRMNotification.create({
          data: {
            type:   "SEQUENCE_SENT",
            title:  `Sequence completed for ${fullName}`,
            body:   `"${enrollment.sequence.name}" finished all ${enrollment.sequence.steps.length} steps`,
            leadId: enrollment.lead.id,
            href:   `/leads/${enrollment.lead.id}`,
          },
        });
      }
      sent++;
    } else {
      errors++;
    }
  }

  return NextResponse.json({ processed: due.length, sent, errors });
}
