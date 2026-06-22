/**
 * GET /api/crm/unsubscribe?email=xxx — one-click unsubscribe from sequences
 * Pauses all active sequence enrollments for this lead.
 * Linked from the footer of every sequence/blast email.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();

  if (!email) {
    return new NextResponse("Missing email", { status: 400 });
  }

  const lead = await prisma.lead.findFirst({
    where: { email },
    select: { id: true, firstName: true },
  });

  if (!lead) {
    return new NextResponse(unsubscribePage("You've been unsubscribed.", "We couldn't find your email in our system, but you won't receive any more emails from us."), {
      headers: { "Content-Type": "text/html" },
    });
  }

  // Pause all active sequence enrollments
  await prisma.emailSequenceEnrollment.updateMany({
    where: { leadId: lead.id, status: "ACTIVE" },
    data: { status: "CANCELLED" },
  });

  // Log as an activity
  await prisma.leadActivity.create({
    data: {
      leadId:  lead.id,
      type:    "NOTE",
      content: "Lead unsubscribed via email footer link — all active sequences cancelled.",
      source:  "UNSUBSCRIBE",
    },
  });

  return new NextResponse(unsubscribePage("You've been unsubscribed.", `Hi ${lead.firstName}, you've been removed from all email sequences. You won't receive any automated emails from us.`), {
    headers: { "Content-Type": "text/html" },
  });
}

function unsubscribePage(title: string, message: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title>
<style>body{font-family:sans-serif;background:#f0f4ff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:white;border-radius:16px;padding:40px;max-width:400px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
h1{color:#0f172a;font-size:22px;margin:0 0 12px}p{color:#64748b;margin:0;line-height:1.6}
</style></head><body><div class="card"><div style="font-size:40px;margin-bottom:16px">✅</div>
<h1>${title}</h1><p>${message}</p></div></body></html>`;
}
