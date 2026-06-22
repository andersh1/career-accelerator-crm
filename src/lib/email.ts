import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM ?? "10x Career Accelerator <onboarding@resend.dev>";
const LMS_URL = process.env.LMS_URL ?? "https://career-accelerator-lms.vercel.app";

function wrap(title: string, body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:linear-gradient(135deg,#0a1628,#1e3a8a);padding:28px 32px;">
        <p style="margin:0;color:#93c5fd;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">10x Career Accelerator</p>
        <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.3;">${title}</h1>
      </td></tr>
      <tr><td style="padding:32px;">${body}</td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #f1f5f9;background:#f8fafc;">
        <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">
          10x Career Accelerator Program · <a href="${LMS_URL}" style="color:#3b82f6;">Open portal</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

const CRM_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export async function sendPasswordResetEmail({ to, name, resetUrl }: { to: string; name: string; resetUrl: string }) {
  if (!resend) return { ok: false, error: "No API key" };
  const subject = "Reset your 10x Career Accelerator CRM password";
  const body = `
    <p style="margin:0 0 16px;color:#475569;font-size:15px;">Hi ${name},</p>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">
      We received a request to reset your CRM password. Click below to choose a new one.
    </p>
    <a href="${resetUrl}" style="display:inline-block;margin:8px 0 24px;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">
      Reset my password →
    </a>
    <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;">This link expires in 1 hour. If you didn't request a reset, you can ignore this email.</p>
  `;
  try {
    await resend.emails.send({ from: FROM, to, subject, html: wrap(subject, body) });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export { CRM_URL };

export async function sendSequenceEmail({
  to, subject, body, leadName, activityId,
}: {
  to: string; subject: string; body: string; leadName: string; activityId?: string;
}) {
  if (!resend) return { ok: false, error: "No API key" };
  const firstName = leadName.split(" ")[0] || leadName;
  // Replace template variables
  const resolvedBody = body
    .replace(/\{\{firstName\}\}/g, firstName)
    .replace(/\{\{name\}\}/g, leadName);
  const htmlBody = resolvedBody
    .split("\n\n")
    .map(p => `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  // Add open-tracking pixel if activityId provided
  const pixel = activityId
    ? `<img src="${LMS_URL}/api/crm/email-open?aid=${activityId}" width="1" height="1" style="display:none" alt="" />`
    : "";
  try {
    await resend.emails.send({ from: FROM, to, subject, html: wrap(subject, htmlBody) + pixel });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function sendIntakeConfirmationEmail({
  to, firstName,
}: {
  to: string; firstName: string;
}) {
  if (!resend) return;
  const subject = `We got your application, ${firstName}! 🙌`;
  const body = `
    <p style="margin:0 0 16px;color:#475569;font-size:15px;">Hey ${firstName},</p>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">
      We received your application to <strong>10x Career Accelerator</strong> and we're excited to learn more about you.
      A member of our team will reach out within <strong>1–2 business days</strong> to talk through your goals and next steps.
    </p>
    <div style="background:#f0f4ff;border:1px solid #c7d7fd;border-radius:12px;padding:20px;margin:20px 0;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#3730a3;text-transform:uppercase;letter-spacing:1px;">What happens next</p>
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:10px;">
        <span style="background:#3b82f6;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;padding:4px;">1</span>
        <p style="margin:0;color:#334155;font-size:14px;">We review your application</p>
      </div>
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:10px;">
        <span style="background:#3b82f6;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;padding:4px;">2</span>
        <p style="margin:0;color:#334155;font-size:14px;">A coach schedules a discovery call with you</p>
      </div>
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <span style="background:#3b82f6;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;padding:4px;">3</span>
        <p style="margin:0;color:#334155;font-size:14px;">You get matched to the right cohort</p>
      </div>
    </div>
    <p style="margin:0;color:#64748b;font-size:13px;line-height:1.7;">
      In the meantime, feel free to reply to this email with any questions. We're rooting for you.
    </p>
  `;
  await resend.emails.send({ from: FROM, to, subject, html: wrap(subject, body) });
}

export async function sendStudentInviteEmail({
  to, studentName, resetUrl, cohort,
}: {
  to: string; studentName: string; resetUrl: string; cohort?: string;
}) {
  if (!resend) return;
  const subject = "Welcome to 10x Career Accelerator — Set up your account";
  const cohortBlock = cohort
    ? `<p style="margin:0 0 16px;color:#334155;font-size:14px;">You've been enrolled in <strong>${cohort}</strong>.</p>`
    : "";
  const body = `
    <p style="margin:0 0 16px;color:#475569;font-size:15px;">Hi ${studentName},</p>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">
      You've been enrolled in the <strong>10x Career Accelerator</strong> program. Click below to set your password and access your student portal.
    </p>
    ${cohortBlock}
    <a href="${resetUrl}" style="display:inline-block;margin:8px 0 24px;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">
      Set up my account →
    </a>
    <p style="margin:0;color:#94a3b8;font-size:12px;">This link expires in 7 days. If you didn't expect this email, you can ignore it.</p>
  `;
  await resend.emails.send({ from: FROM, to, subject, html: wrap(subject, body) });
}
