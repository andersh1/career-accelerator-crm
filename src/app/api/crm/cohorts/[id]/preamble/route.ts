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

// The send loop now spaces requests out (Resend's 10/sec cap) and retries a
// failure once, so a full cohort needs more than the default budget.
export const maxDuration = 60;

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

  const { moduleId, dryRun, force, resendTo } = await req.json() as
    { moduleId?: string; dryRun?: boolean; force?: boolean; resendTo?: string };
  if (!moduleId) return NextResponse.json({ error: "moduleId is required" }, { status: 400 });

  const row = await prisma.cohortSchedule.findFirst({
    where: { cohortId: params.id, moduleId },
    include: {
      module: { select: { id: true, number: true, title: true } },
      cohort: { select: { id: true, name: true } },
    },
  });
  if (!row) return NextResponse.json({ error: "No schedule row for that module" }, { status: 404 });

  // Targeted recovery: re-send to ONE Fellow who was dropped from the batch
  // (a transient Resend 429 cost someone the kick-off). This deliberately does
  // not touch preambleSentAt — the batch already went out — so it can run after
  // "Already sent" without re-mailing the whole cohort, and never sends to
  // anyone outside this cohort's roster.
  if (resendTo) {
    const tpl = await prisma.emailTemplate.findUnique({
      where: { key: `module-preamble-${row.module.number}` },
      select: { body: true },
    });
    if (!tpl || /\[Dan writes/.test(tpl.body)) {
      return NextResponse.json({ error: `module-preamble-${row.module.number} still has placeholder copy` }, { status: 400 });
    }
    const one = await prisma.user.findFirst({
      where: { cohortId: params.id, role: "STUDENT", email: { equals: resendTo, mode: "insensitive" } },
      select: { name: true, email: true },
    });
    if (!one) return NextResponse.json({ error: `${resendTo} is not a Fellow in this cohort` }, { status: 404 });
    const ok = await sendModulePreambleEmail({
      to: one.email,
      studentName: one.name,
      moduleNumber: row.module.number,
      moduleTitle: row.module.title,
      preworkDue: fmt(row.preworkDue),
      sessionDate: fmt(row.sessionDate),
      moduleUrl: `${LMS_URL}/modules/${row.module.id}`,
      ignoreEnabled: true,
    }).catch(() => false);
    return NextResponse.json({ ok, resendTo: one.email, name: one.name }, { status: ok ? 200 : 502 });
  }

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
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const sendOne = (f: (typeof fellows)[number]) =>
    sendModulePreambleEmail({
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

  // Resend caps us at 10 requests/second. A tight loop over a full cohort trips
  // that and silently drops whoever lands on the 11th slot — which is exactly
  // how one Fellow missed the M2 kick-off. Space the sends out to stay well
  // under the limit, and give any failure one retry after a short backoff so a
  // momentary 429 (or an Outlook greylist) doesn't cost someone the email.
  for (let i = 0; i < fellows.length; i++) {
    const f = fellows[i];
    if (i > 0) await sleep(150);
    let ok = await sendOne(f);
    if (!ok) { await sleep(1200); ok = await sendOne(f); }
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
