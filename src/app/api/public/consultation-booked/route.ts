/**
 * POST /api/public/consultation-booked?key=INTERNAL_API_SECRET
 *
 * Called by the LMS Calendly webhook when a prospect books a consultation.
 * Email lives in the CRM, so the LMS hands the event over rather than sending
 * itself. Guarded by a shared secret because it emails the team.
 */
import { NextRequest, NextResponse } from "next/server";
import { sendConsultationBookedAlert } from "@/lib/email";

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!process.env.INTERNAL_API_SECRET || key !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.name || !body?.startTime) {
    return NextResponse.json({ error: "name, email and startTime are required" }, { status: 400 });
  }

  try {
    await sendConsultationBookedAlert({
      name: String(body.name),
      email: String(body.email),
      startTime: new Date(body.startTime),
      joinUrl: body.joinUrl ?? null,
      leadId: body.leadId ?? null,
      isNewLead: Boolean(body.isNewLead),
    });
  } catch (err) {
    console.error("[consultation-booked] alert failed:", err);
    return NextResponse.json({ error: "Email failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
