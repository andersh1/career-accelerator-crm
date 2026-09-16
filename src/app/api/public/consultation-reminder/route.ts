/**
 * POST /api/public/consultation-reminder?key=INTERNAL_API_SECRET
 *
 * Called by the LMS consultation-reminder cron. The CRM owns everything a
 * prospect reads, so the LMS decides WHO is due a reminder and hands the send
 * over here rather than writing prospect-facing copy of its own — the same
 * split the consultation-booked alert already uses.
 *
 * Also logs the reminder on the lead, so "did they get told?" is answerable
 * from the lead's timeline rather than from a log nobody reads.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendConsultationReminder } from "@/lib/email";

const KINDS = ["DAY_BEFORE", "HOUR_BEFORE"] as const;

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!process.env.INTERNAL_API_SECRET || key !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as {
    email?: string; name?: string; startTime?: string; kind?: string;
    joinUrl?: string | null; rescheduleUrl?: string | null; cancelUrl?: string | null;
  } | null;

  const email = body?.email?.trim().toLowerCase();
  const kind = (body?.kind ?? "").toUpperCase() as typeof KINDS[number];
  if (!email || !body?.startTime || !KINDS.includes(kind)) {
    return NextResponse.json(
      { error: "email, startTime and kind (DAY_BEFORE | HOUR_BEFORE) are required" }, { status: 400 });
  }

  const lead = await prisma.lead.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, firstName: true },
  });

  const firstName = lead?.firstName
    || body.name?.trim().split(/\s+/)[0]
    || "there";

  let sent = false;
  try {
    sent = await sendConsultationReminder({
      to: email,
      firstName,
      startTime: new Date(body.startTime),
      joinUrl: body.joinUrl ?? null,
      rescheduleUrl: body.rescheduleUrl ?? null,
      cancelUrl: body.cancelUrl ?? null,
      kind,
    });
  } catch (err) {
    console.error("[consultation-reminder] send failed:", err);
    return NextResponse.json({ error: "Email failed" }, { status: 502 });
  }

  // Switched off in the Email Playbook. Not an error — say so plainly, and
  // don't write a "reminder sent" line for an email nobody received.
  if (!sent) {
    return NextResponse.json({ ok: true, sent: false, reason: "template disabled", kind });
  }

  if (lead) {
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: "EMAIL",
        content: kind === "DAY_BEFORE"
          ? "Consultation reminder sent (day before)"
          : "Consultation reminder sent (1 hour before)",
      },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, sent: true, sentTo: email, kind, leadLogged: !!lead });
}
