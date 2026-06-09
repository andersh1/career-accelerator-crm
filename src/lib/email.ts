import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM ?? "Career Accelerator <onboarding@resend.dev>";
const LMS_URL = process.env.LMS_URL ?? "https://career-accelerator-lms.vercel.app";

function wrap(title: string, body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:linear-gradient(135deg,#0a1628,#1e3a8a);padding:28px 32px;">
        <p style="margin:0;color:#93c5fd;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Career Accelerator</p>
        <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.3;">${title}</h1>
      </td></tr>
      <tr><td style="padding:32px;">${body}</td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #f1f5f9;background:#f8fafc;">
        <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">
          Career Accelerator Program · <a href="${LMS_URL}" style="color:#3b82f6;">Open portal</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export async function sendStudentInviteEmail({
  to, studentName, resetUrl, cohort,
}: {
  to: string; studentName: string; resetUrl: string; cohort?: string;
}) {
  if (!resend) return;
  const subject = "Welcome to Career Accelerator — Set up your account";
  const cohortBlock = cohort
    ? `<p style="margin:0 0 16px;color:#334155;font-size:14px;">You've been enrolled in <strong>${cohort}</strong>.</p>`
    : "";
  const body = `
    <p style="margin:0 0 16px;color:#475569;font-size:15px;">Hi ${studentName},</p>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">
      You've been enrolled in the <strong>Career Accelerator</strong> program. Click below to set your password and access your student portal.
    </p>
    ${cohortBlock}
    <a href="${resetUrl}" style="display:inline-block;margin:8px 0 24px;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">
      Set up my account →
    </a>
    <p style="margin:0;color:#94a3b8;font-size:12px;">This link expires in 7 days. If you didn't expect this email, you can ignore it.</p>
  `;
  await resend.emails.send({ from: FROM, to, subject, html: wrap(subject, body) });
}
