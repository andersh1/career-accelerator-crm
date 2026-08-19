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
  if (!secret) return false;
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

    // ── Smart skip logic ────────────────────────────────────────────────────
    // 1. If lead is already ENROLLED or has unsubscribed, stop the sequence.
    const leadFull = await prisma.lead.findUnique({
      where: { id: enrollment.lead.id },
      select: { stage: true, unsubscribed: true },
    });
    if (leadFull?.unsubscribed) {
      await prisma.emailSequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "CANCELLED", completedAt: now },
      });
      continue;
    }
    if (leadFull?.stage === "ENROLLED") {
      await prisma.emailSequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "COMPLETED", completedAt: now },
      });
      await prisma.leadActivity.create({
        data: {
          leadId:  enrollment.lead.id,
          type:    "NOTE",
          content: `Sequence "${enrollment.sequence.name}" auto-completed — lead is already enrolled`,
          source:  "SEQUENCE",
        },
      });
      // auto-complete is not a sent email — don't increment sent
      continue;
    }

    // 2. For step 2+, if the lead has already opened an email from this sequence
    //    in the last 7 days, skip this follow-up step and advance to the next.
    if (step.stepNumber > 1) {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
      const recentOpen = await prisma.leadActivity.findFirst({
        where: {
          leadId:  enrollment.lead.id,
          type:    "EMAIL",
          source:  "SEQUENCE",
          openedAt: { not: null },
          createdAt: { gte: sevenDaysAgo },
        },
      });
      if (recentOpen) {
        // Skip this step — lead already engaged
        await prisma.leadActivity.create({
          data: {
            leadId:  enrollment.lead.id,
            type:    "NOTE",
            content: `Sequence step ${step.stepNumber} skipped — lead already engaged (opened a recent sequence email)`,
            source:  "SEQUENCE",
          },
        });
        const nextStep = enrollment.sequence.steps.find(s => s.stepNumber === enrollment.currentStep + 1);
        if (nextStep) {
          await prisma.emailSequenceEnrollment.update({
            where: { id: enrollment.id },
            data: {
              currentStep: nextStep.stepNumber,
              nextSendAt:  new Date(now.getTime() + nextStep.delayDays * 86400000),
            },
          });
        } else {
          await prisma.emailSequenceEnrollment.update({
            where: { id: enrollment.id },
            data: { status: "COMPLETED", completedAt: now },
          });
        }
        // step skipped — not a sent email
        continue;
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const unsubUrl = `${process.env.NEXTAUTH_URL ?? "https://career-accelerator-lms.vercel.app"}/api/crm/unsubscribe?email=${encodeURIComponent(enrollment.lead.email)}`;

    // Create the activity record FIRST so we have its ID for the tracking pixel
    const activity = await prisma.leadActivity.create({
      data: {
        leadId:  enrollment.lead.id,
        type:    "EMAIL",
        subject: step.subject,
        emailTo: enrollment.lead.email,
        content: `[Sequence: ${enrollment.sequence.name}] Step ${step.stepNumber}: ${step.subject}`,
        source:  "SEQUENCE",
      },
    });

    const result = await sendSequenceEmail({
      to:         enrollment.lead.email,
      subject:    step.subject,
      body:       step.body + `\n\n---\n[Unsubscribe from these emails](${unsubUrl})`,
      leadName:   fullName,
      activityId: activity.id,
    });

    if (result.ok) {

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
      // Log the failure and pause the enrollment so it doesn't retry forever
      await prisma.leadActivity.create({
        data: {
          leadId:  enrollment.lead.id,
          type:    "NOTE",
          content: `Sequence "${enrollment.sequence.name}" step ${step.stepNumber} failed to send — enrollment paused`,
          source:  "SEQUENCE",
        },
      });
      await prisma.emailSequenceEnrollment.update({
        where: { id: enrollment.id },
        data:  { status: "PAUSED" },
      });
    }
  }

  return NextResponse.json({ processed: due.length, sent, errors });
}
