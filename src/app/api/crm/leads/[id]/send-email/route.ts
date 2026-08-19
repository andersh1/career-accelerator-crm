import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { wrapLinksForTracking } from "@/lib/emailTracking";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM   = process.env.EMAIL_FROM ?? "Vantage Career Accelerator <hello@vantagecareer.co>";

function toHtml(text: string, subject: string) {
  const htmlBody = text
    .split("\n\n")
    .map(p => `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:linear-gradient(135deg,#0a1628,#1e3a8a);padding:28px 32px;">
        <p style="margin:0;color:#93c5fd;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Vantage Career Accelerator</p>
        <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.3;">${subject}</h1>
      </td></tr>
      <tr><td style="padding:32px;">${htmlBody}</td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #f1f5f9;background:#f8fafc;">
        <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Vantage Career Accelerator Program</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const body = await req.json();
  const { subject, body: text } = body as { subject: string; body: string };

  if (!subject?.trim() || !text?.trim()) {
    return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });
  }

  // Send via Resend
  if (!resend) {
    return NextResponse.json({ error: "Email not configured — add RESEND_API_KEY to env vars" }, { status: 503 });
  }

  // Create the activity record first so we have its ID for click tracking correlation
  const activity = await prisma.leadActivity.create({
    data: {
      leadId:    params.id,
      type:      "EMAIL",
      subject:   subject.trim(),
      emailTo:   lead.email,
      content:   text.trim(),
      source:    "COMPOSER",
      createdBy: (session as { user: { id: string } }).user.id,
    },
  });

  // Build HTML and wrap links for click tracking
  const rawHtml     = toHtml(text.trim(), subject.trim());
  const trackedHtml = wrapLinksForTracking(rawHtml, params.id, activity.id);

  const { error: sendError } = await resend.emails.send({
    from:    FROM,
    to:      lead.email,
    subject: subject.trim(),
    html:    trackedHtml,
  });

  if (sendError) {
    // Clean up the activity record if sending failed
    await prisma.leadActivity.delete({ where: { id: activity.id } }).catch((cleanupErr) => {
      console.error("[send-email] Failed to clean up orphaned activity:", activity.id, cleanupErr);
    });
    return NextResponse.json({ error: sendError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
