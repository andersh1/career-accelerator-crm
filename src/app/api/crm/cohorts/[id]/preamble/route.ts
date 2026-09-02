/**
 * POST /api/crm/cohorts/[id]/preamble — send one module's kick-off email now.
 *
 * Body: { moduleId, dryRun?: boolean }
 *
 * The scheduled cron sends these at 9am ET on the preamble date. This is the
 * "send it now" path for when the date has passed, or when you simply want it
 * out today.
 *
 * Two things it does NOT inherit from the cron:
 *  - It ignores the template's enabled flag. Pressing this button IS the
 *    decision to send; the flag governs the automated run.
 *  - It refuses to send twice. preambleSentAt is claimed before the first
 *    email goes out, so a double-click or a retry cannot mail eleven people a
 *    second copy. `force` is required to override that deliberately.
 *
 * dryRun returns exactly who would receive it without sending anything, so the
 * recipient list can be checked before eleven real people get mail.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendModulePreambleEmail } from "@/lib/email";

const LMS_URL = process.env.LMS_URL ?? "https://lms.vantagecareer.co";

function fmt(d: Date | null): string {
  if (!d) return "the date on your dashboard";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric",
  }).format(d);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const crmRole = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || crmRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId, dryRun, force } = await req.json() as
    { moduleId?: string; dryRun?: boolean; force?: boolean };
  if (!moduleId) return NextResponse.json({ error: "moduleId is required" }, { status: 400 });

  const row = await prisma.cohortSchedule.findFirst({
    where: { cohortId: params.id, moduleId },
    include: {
      module: { select: { id: true, number: true, title: true } },
      cohort: { select: { id: true, name: true } },
    },
  });
  if (!row) return NextResponse.json({ error: "No schedule row for that module" }, { status: 404 });

  if (row.preambleSentAt && !force) {
    return NextResponse.json({
      error: "Already sent",
      sentAt: row.preambleSentAt,
      hint: "Re-sending would mail the cohort a second copy. Pass force to override.",
    }, { status: 409 });
  }

  const template = await prisma.emailTemplate.findUnique({
    where: { key: `module-preamble-${row.module.number}` },
    select: { body: true },
  });
  if (!template || /\[Dan writes/.test(template.body)) {
    return NextResponse.json({
      error: `module-preamble-${row.module.number} still has placeholder copy — write it first`,
    }, { status: 400 });
  }

  const fellows = await prisma.user.findMany({
    where: { cohortId: params.id, role: "STUDENT" },
    select: { name: true, email: true },
    orderBy: { name: "asc" },
  });
  if (fellows.length === 0) {
    return NextResponse.json({ error: "That cohort has no Fellows" }, { status: 400 });
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      module: `${row.module.number} — ${row.module.title}`,
      cohort: row.cohort.name,
      wouldSendTo: fellows.map(f => ({ name: f.name, email: f.email })),
      count: fellows.length,
    });
  }

  // Claim before sending: under-sending beats mailing the cohort twice.
  await prisma.cohortSchedule.update({
    where: { id: row.id },
    data: { preambleSentAt: new Date() },
  });

  const failed: string[] = [];
  let sent = 0;
  for (const f of fellows) {
    const ok = await sendModulePreambleEmail({
      to: f.email,
      studentName: f.name,
      moduleNumber: row.module.number,
      moduleTitle: row.module.title,
      preworkDue: fmt(row.preworkDue),
      sessionDate: fmt(row.sessionDate),
      moduleUrl: `${LMS_URL}/modules/${row.module.id}`,
      // The button press is the decision; the enabled flag governs the cron.
      ignoreEnabled: true,
    }).catch(() => false);
    if (ok) sent++; else failed.push(f.email);
  }

  // Nothing went out at all — release the claim so this stays sendable.
  if (sent === 0) {
    await prisma.cohortSchedule.update({
      where: { id: row.id },
      data: { preambleSentAt: null },
    });
  }

  return NextResponse.json({
    ok: sent > 0,
    module: `${row.module.number} — ${row.module.title}`,
    sent,
    of: fellows.length,
    failed,
  });
}
