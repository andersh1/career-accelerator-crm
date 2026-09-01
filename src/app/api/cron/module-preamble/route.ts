/**
 * GET /api/cron/module-preamble — sends each module's kick-off email.
 *
 * Runs daily. For every active cohort, finds modules whose preambleDate has
 * arrived and that have not been sent, and mails that cohort's Fellows.
 *
 * Three deliberate guards:
 *  - preambleSentAt is claimed BEFORE sending, so a retry or an overlapping run
 *    cannot mail a cohort twice. Duplicate kick-off emails to eleven people is
 *    the failure that matters here.
 *  - A template that is switched off sends nothing and is NOT marked sent, so a
 *    module whose copy is not written yet simply waits.
 *  - Nothing is inferred from module start dates. The date is set per cohort in
 *    the Cohorts → Schedule tab, because a kick-off does not always land on the
 *    day a module opens.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendModulePreambleEmail } from "@/lib/email";

const LMS_URL = process.env.LMS_URL ?? "https://lms.vantagecareer.co";

function fmt(d: Date | null): string {
  if (!d) return "the date on your dashboard";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric",
  }).format(d);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers as Headers).get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.cohortSchedule.findMany({
    where: {
      preambleDate: { not: null, lte: now },
      preambleSentAt: null,
      cohort: { isActive: true },
    },
    include: {
      module: { select: { number: true, title: true, id: true } },
      cohort: { select: { id: true, name: true } },
    },
    orderBy: { preambleDate: "asc" },
  });

  const results: { cohort: string; module: number; sent: number; skipped?: string }[] = [];

  for (const row of due) {
    const fellows = await prisma.user.findMany({
      where: { cohortId: row.cohort.id, role: "STUDENT" },
      select: { name: true, email: true },
    });
    if (fellows.length === 0) {
      results.push({ cohort: row.cohort.name, module: row.module.number, sent: 0, skipped: "no Fellows" });
      continue;
    }

    // Claim it first. If sending half-fails we would rather under-send than mail
    // the cohort a second copy on the next run.
    await prisma.cohortSchedule.update({
      where: { id: row.id },
      data: { preambleSentAt: now },
    });

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
      }).catch(() => false);
      if (ok) sent++;
    }

    // Template switched off = copy not ready. Release the claim so it goes out
    // once the copy is written, rather than being silently skipped forever.
    if (sent === 0) {
      await prisma.cohortSchedule.update({
        where: { id: row.id },
        data: { preambleSentAt: null },
      });
      results.push({
        cohort: row.cohort.name, module: row.module.number, sent: 0,
        skipped: `template module-preamble-${row.module.number} is switched off`,
      });
      continue;
    }

    results.push({ cohort: row.cohort.name, module: row.module.number, sent });
  }

  return NextResponse.json({
    ok: true,
    due: due.length,
    emailsSent: results.reduce((n, r) => n + r.sent, 0),
    results,
  });
}
