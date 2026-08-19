/**
 * POST /api/skill/session/[id]/commit
 * Saves the session note to the CRM activity feed and optionally sends a follow-up email.
 * Authenticated via SKILL_API_KEY (Bearer token) — no browser session required.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM   = process.env.EMAIL_FROM ?? "Career Accelerator <onboarding@resend.dev>";

function checkApiKey(req: NextRequest) {
  const auth  = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token === process.env.SKILL_API_KEY && token.length > 0;
}

function toHtml(body: string) {
  const paragraphs = body
    .split("\n\n")
    .map(p =>
      `<p style="margin:0 0 16px;color:#1e293b;font-size:15px;line-height:1.75;">${p.replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f0fdf4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0"
      style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
      <tr><td style="background:linear-gradient(135deg,#0a6b64,#158c84);padding:24px 32px;">
        <p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Vantage Career Accelerator</p>
      </td></tr>
      <tr><td style="padding:32px;">${paragraphs}</td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #f1f5f9;">
        <p style="margin:0;color:#94a3b8;font-size:11px;">— Dan Sommer, Vantage Career Accelerator</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lead = await prisma.lead.findUnique({
    where:  { id: params.id },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const { note, sendEmail } = await req.json() as {
    note:       string;
    sendEmail?: { subject: string; body: string };
  };

  if (!note?.trim()) {
    return NextResponse.json({ error: "note is required" }, { status: 400 });
  }

  // Save session note as MEETING activity
  await prisma.leadActivity.create({
    data: { leadId: lead.id, type: "MEETING", content: note.trim() },
  });

  await prisma.lead.update({ where: { id: lead.id }, data: { updatedAt: new Date() } });

  // Optionally send follow-up email
  let emailSent = false;
  if (sendEmail?.subject?.trim() && sendEmail?.body?.trim()) {
    if (!resend) {
      return NextResponse.json(
        { error: "Email not configured — RESEND_API_KEY missing" },
        { status: 503 },
      );
    }

    const { error: sendError } = await resend.emails.send({
      from:    FROM,
      to:      lead.email,
      subject: sendEmail.subject.trim(),
      html:    toHtml(sendEmail.body.trim()),
    });

    if (sendError) {
      return NextResponse.json({ error: `Email failed: ${sendError.message}` }, { status: 500 });
    }

    await prisma.leadActivity.create({
      data: {
        leadId:  lead.id,
        type:    "EMAIL",
        subject: sendEmail.subject.trim(),
        emailTo: lead.email,
        content: sendEmail.body.trim(),
        source:  "COMPOSER",
      },
    });

    emailSent = true;
  }

  // Notify in CRM bell
  await prisma.cRMNotification.create({
    data: {
      type:   "NEW_INTAKE",
      title:  `Session logged — ${lead.firstName} ${lead.lastName}`,
      body:   emailSent ? "Follow-up email sent." : "Note saved. No email sent.",
      leadId: lead.id,
      href:   `/leads/${lead.id}`,
    },
  }).catch(() => {});

  return NextResponse.json({
    ok:        true,
    emailSent,
    crmUrl:    `https://crm.vantagecareer.co/leads/${lead.id}`,
  });
}
