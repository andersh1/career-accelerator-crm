/**
 * POST /api/crm/cohorts/[id]/orientation-email   { dryRun?, force? }
 *
 * The pre-orientation email, sent by hand rather than on a schedule: it goes
 * once per cohort, the timing is a judgement call, and a press is a clearer
 * decision than a date nobody remembers setting.
 *
 * dryRun returns the rendered copy and the recipient list without sending, so
 * the thing that reaches a Fellow can be read first.
 *
 * Guards, in order of what they protect against:
 *  - orientationEmailSentAt is stamped, so a second press cannot mail twice.
 *  - Only invited or onboarded Fellows, the same rule the kick-off cron uses.
 *    Somebody who has never been invited has no account to act on.
 *  - Refuses without an orientation date, because the email is about when
 *    orientation is.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { orientationEmailParts } from "@/lib/orientation-email";
import { sendOrientationEmail } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { dryRun, force } = await req.json().catch(() => ({})) as { dryRun?: boolean; force?: boolean };

  const cohort = await prisma.cohort.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, orientationDate: true, orientationEmailSentAt: true },
  });
  if (!cohort) return NextResponse.json({ error: "No such cohort" }, { status: 404 });

  if (!cohort.orientationDate) {
    return NextResponse.json(
      { error: "Set the orientation date first. This email is about when orientation is." },
      { status: 400 },
    );
  }
  if (cohort.orientationEmailSentAt && !force && !dryRun) {
    return NextResponse.json({
      error: `Already sent ${cohort.orientationEmailSentAt.toISOString().slice(0, 10)}. Use Send again if you mean to.`,
      alreadySent: cohort.orientationEmailSentAt,
    }, { status: 409 });
  }

  const parts = await orientationEmailParts(params.id);
  if (!parts) return NextResponse.json({ error: "Could not build the schedule." }, { status: 500 });

  const fellows = await prisma.user.findMany({
    where: {
      cohortId: params.id, role: "STUDENT", withdrawnAt: null,
      OR: [{ onboardedAt: { not: null } }, { invitedAt: { not: null } }],
    },
    select: { name: true, email: true },
  });

  if (dryRun) {
    const rendered = await sendOrientationEmail({
      to: "", studentName: fellows[0]?.name ?? "Jordan", parts, preview: true,
    });
    if (typeof rendered === "boolean") {
      return NextResponse.json({
        error: "The orientation template is switched off in Automation → Email Playbook.",
      }, { status: 400 });
    }
    return NextResponse.json({
      dryRun: true,
      cohort: cohort.name,
      recipients: fellows.map(f => f.email),
      alreadySent: cohort.orientationEmailSentAt,
      subject: rendered.subject,
      html: rendered.html,
    });
  }

  if (fellows.length === 0) {
    return NextResponse.json({
      error: "Nobody to send to yet. Publish the cohort first, so Fellows have an account to open.",
    }, { status: 400 });
  }

  let sent = 0;
  for (const f of fellows) {
    const ok = await sendOrientationEmail({ to: f.email, studentName: f.name, parts }).catch(() => false);
    if (ok) sent++;
  }

  if (sent > 0) {
    await prisma.cohort.update({
      where: { id: params.id },
      data: { orientationEmailSentAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true, sent, of: fellows.length });
}
