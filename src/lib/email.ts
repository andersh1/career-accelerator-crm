import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM ?? "Vantage Career Accelerator <hello@vantagecareer.co>";
const LMS_URL = process.env.LMS_URL ?? "https://lms.vantagecareer.co";

// ── DB-backed templates (editable in Automation → Email Playbook) ────────────
import { prisma } from "@/lib/prisma";
function subVars(s: string, vars: Record<string, string>) {
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}
function textToHtml(t: string) {
  const esc = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.trim().split(/\n\n+/).map(p =>
    `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">${p
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br/>")}</p>`).join("");
}
export async function renderTemplate(
  key: string,
  defaults: { subject: string; body: string },
  vars: Record<string, string>
): Promise<{ subject: string; bodyHtml: string } | null> {
  let t: { subject: string; body: string } = defaults;
  try {
    const row = await prisma.emailTemplate.findUnique({ where: { key }, select: { subject: true, body: true, enabled: true } });
    if (row) {
      if (!row.enabled) return null; // switched off in the Email Playbook
      t = row;
    }
  } catch { /* fall back to defaults */ }
  return { subject: subVars(t.subject, vars), bodyHtml: textToHtml(subVars(t.body, vars)) };
}

function wrap(title: string, body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f1efe8;font-family:'Montserrat','Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1efe8;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e0d6;">
      <tr><td style="background:linear-gradient(180deg,#086c64 0%,#084f4a 100%);padding:28px 32px;">
        <p style="margin:0;color:rgba(255,255,255,0.5);font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Vantage Career Accelerator</p>
        <h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;font-weight:800;line-height:1.3;">${title}</h1>
      </td></tr>
      <tr><td style="padding:32px;">${body}</td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #e4e0d6;background:#f8f6f1;">
        <p style="margin:0;color:#949598;font-size:11px;text-align:center;">
          Vantage Career Accelerator Program · <a href="${LMS_URL}" style="color:#086c64;text-decoration:none;">Open portal</a>
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
  const subject = "Reset your Vantage Career Accelerator CRM password";
  const body = `
    <p style="margin:0 0 16px;color:#475569;font-size:15px;">Hi ${name},</p>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">
      We received a request to reset your CRM password. Click below to choose a new one.
    </p>
    <a href="${resetUrl}" style="display:inline-block;margin:8px 0 24px;background:#086c64;color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">
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
  to, subject, body, leadName, activityId, unsubHtml,
}: {
  to: string; subject: string; body: string; leadName: string; activityId?: string; unsubHtml?: string;
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
    ? `<img src="${CRM_URL}/api/crm/email-open?aid=${activityId}" width="1" height="1" style="display:none" alt="" />`
    : "";
  try {
    await resend.emails.send({ from: FROM, to, subject, html: wrap(subject, htmlBody) + pixel + (unsubHtml ?? "") });
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
  const t = await renderTemplate("intake-confirmation", {
    subject: "We got your application, {{firstName}}! 🙌",
    body: `Hey {{firstName}},\n\nWe received your application to **Vantage Career Accelerator** and we're excited to learn more about you. A member of our team will reach out within **1–2 business days** to talk through your goals and next steps.\n\n**What happens next:**\n1. We review your application\n2. A coach schedules a discovery call with you\n3. You get matched to the right cohort\n\nIn the meantime, feel free to reply to this email with any questions. We're rooting for you.`,
  }, { firstName });
  if (!t) return; // switched off in the Email Playbook
  await resend.emails.send({ from: FROM, to, subject: t.subject, html: wrap(t.subject, t.bodyHtml) });
}

export async function sendGraduationEmail({
  to, studentName, cohortName,
}: {
  to: string; studentName: string; cohortName: string;
}) {
  if (!resend) return;
  const subject = `🎓 Congratulations, ${studentName.split(" ")[0]}! You've graduated.`;
  const body = `
    <p style="margin:0 0 16px;color:#475569;font-size:15px;">Hi ${studentName.split(" ")[0]},</p>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">
      On behalf of the entire Vantage Career team — <strong>congratulations on completing ${cohortName}!</strong>
      This is a huge milestone and you've put in the work to get here.
    </p>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">
      Your certificate of completion is now available in your student portal.
    </p>
    <a href="${LMS_URL}/certificate" style="display:inline-block;margin:8px 0 24px;background:#086c64;color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">
      View my certificate →
    </a>
    <p style="margin:0;color:#64748b;font-size:13px;line-height:1.7;">
      Keep pushing. The best is ahead. We're rooting for you.
    </p>
  `;
  await resend.emails.send({ from: FROM, to, subject, html: wrap(subject, body) });
}

export async function sendAdminApplicationAlert({
  firstName, lastName, email, phone, leadId, notes,
}: {
  firstName: string; lastName: string; email: string; phone: string | null;
  leadId: string; notes: string | null;
}) {
  if (!resend) return;
  const subject = `New 3i NextGen application: ${firstName} ${lastName}`;
  const leadUrl = `${CRM_URL}/leads/${leadId}`;

  // Parse notes into labeled rows for a clean preview
  const notesRows = notes
    ? notes.split(/\n\n+/).map(block => {
        const colonIdx = block.indexOf(":\n");
        if (colonIdx === -1) {
          const singleLine = block.indexOf(": ");
          if (singleLine !== -1) return `<tr><td style="padding:6px 0;color:#949598;font-size:12px;font-weight:700;width:140px;vertical-align:top;">${block.slice(0, singleLine)}</td><td style="padding:6px 0;color:#334155;font-size:13px;">${block.slice(singleLine + 2)}</td></tr>`;
          return "";
        }
        const label = block.slice(0, colonIdx);
        const val = block.slice(colonIdx + 2).trim();
        return `<tr><td style="padding:6px 0;color:#949598;font-size:12px;font-weight:700;width:140px;vertical-align:top;">${label}</td><td style="padding:6px 0;color:#334155;font-size:13px;">${val.replace(/\n/g, "<br/>")}</td></tr>`;
      }).filter(Boolean).join("")
    : "";

  const body = `
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">
      A new application was just submitted through the <strong>3i NextGen</strong> portal.
    </p>
    <div style="background:#f0faf8;border:1px solid #b2e0da;border-radius:12px;padding:20px;margin:0 0 20px;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#086c64;text-transform:uppercase;letter-spacing:1px;">Applicant</p>
      <p style="margin:0;font-size:18px;font-weight:800;color:#14211f;">${firstName} ${lastName}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#5a6663;">${email}${phone ? ` · ${phone}` : ""}</p>
    </div>
    ${notesRows ? `
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#949598;text-transform:uppercase;letter-spacing:1px;">Application Answers</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
      ${notesRows}
    </table>` : ""}
    <a href="${leadUrl}" style="display:inline-block;margin:0 0 24px;background:#086c64;color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">
      View in CRM →
    </a>
  `;
  try {
    await resend.emails.send({
      from: FROM,
      to: ["dan@10ximpact.co", "caleb@10ximpact.co"],
      subject,
      html: wrap(subject, body),
    });
  } catch { /* non-fatal */ }
}

export async function sendCrmInviteEmail({
  to, name, crmRole, isNew, tempPassword, loginUrl,
}: {
  to: string; name: string; crmRole: string; isNew: boolean;
  tempPassword?: string; loginUrl: string;
}) {
  if (!resend) return;
  const subject = "You've been invited to Vantage Career Accelerator CRM";
  const roleLabel = crmRole === "ADMIN" ? "Admin" : "Member";
  const roleBadgeBg = crmRole === "ADMIN" ? "#086c64" : "#5a6663";

  const credentialsBlock = isNew && tempPassword
    ? `
      <div style="background:#f0faf8;border:1px solid #b2e0da;border-radius:12px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#086c64;text-transform:uppercase;letter-spacing:1px;">Your login details</p>
        <p style="margin:0 0 6px;font-size:14px;color:#14211f;"><strong>URL:</strong> <a href="${loginUrl}" style="color:#086c64;">${loginUrl}</a></p>
        <p style="margin:0 0 6px;font-size:14px;color:#14211f;"><strong>Email:</strong> ${to}</p>
        <p style="margin:0;font-size:14px;color:#14211f;"><strong>Temporary password:</strong> <code style="background:#e4e0d6;color:#14211f;padding:2px 8px;border-radius:6px;font-size:13px;">${tempPassword}</code></p>
      </div>
      <p style="margin:0 0 20px;color:#5a6663;font-size:13px;line-height:1.7;">
        Please change your password after your first login via <strong>Settings → Change Password</strong>.
      </p>`
    : `
      <div style="background:#f0faf8;border:1px solid #b2e0da;border-radius:12px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 6px;font-size:14px;color:#14211f;"><strong>URL:</strong> <a href="${loginUrl}" style="color:#086c64;">${loginUrl}</a></p>
        <p style="margin:0;font-size:14px;color:#5a6663;">Use your existing password to sign in.</p>
      </div>`;

  const body = `
    <p style="margin:0 0 16px;color:#475569;font-size:15px;">Hi ${name},</p>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">
      You've been added to the <strong>Vantage Career Accelerator CRM</strong> as a
      <span style="display:inline-block;background:${roleBadgeBg};color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:999px;vertical-align:middle;margin-left:4px;">${roleLabel}</span>.
    </p>
    ${credentialsBlock}
    <a href="${loginUrl}" style="display:inline-block;background:#086c64;color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">
      Log in to CRM →
    </a>
  `;
  await resend.emails.send({ from: FROM, to, subject, html: wrap(subject, body) });
}

export async function sendOutcomeFollowUpEmail({
  to, firstName, token,
}: {
  to: string; firstName: string; token: string;
}) {
  if (!resend) return { ok: false, error: "No API key" };
  const formUrl = `${CRM_URL}/public/outcomes?token=${token}`;
  const subject = `Quick check-in, ${firstName} — where did you land?`;
  const body = `
    <p style="margin:0 0 16px;color:#475569;font-size:15px;">Hey ${firstName},</p>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">
      Congratulations on completing Vantage Career Accelerator! We're so proud of the work you put in.
    </p>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">
      We'd love to hear where you've landed — whether you've started a new role, are still in your search, or are exploring options.
      Your outcome helps us understand what's working and improve the program for future students.
    </p>
    <a href="${formUrl}" style="display:inline-block;margin:8px 0 24px;background:#086c64;color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">
      Share my outcome →
    </a>
    <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.7;">
      Takes less than 2 minutes. You can update your info at any time by clicking the link above.
    </p>
  `;
  try {
    await resend.emails.send({ from: FROM, to, subject, html: wrap(subject, body) });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function sendStudentInviteEmail({
  to, studentName, resetUrl, cohort,
}: {
  to: string; studentName: string; resetUrl: string; cohort?: string;
}) {
  if (!resend) return;
  const t = await renderTemplate("student-invite", {
    subject: "Welcome to Vantage Career Accelerator — Set up your account",
    body: `Hi {{firstName}},\n\nYou've been enrolled in the **Vantage Career Accelerator** program. Click below to set your password and access your student portal.\n\n{{cohortLine}}`,
  }, {
    firstName: studentName,
    cohortLine: cohort ? `You've been enrolled in **${cohort}**.` : "",
  });
  if (!t) return; // switched off in the Email Playbook
  const body = `${t.bodyHtml}
    <a href="${resetUrl}" style="display:inline-block;margin:8px 0 24px;background:#086c64;color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">
      Set up my account →
    </a>
    <p style="margin:0;color:#94a3b8;font-size:12px;">This link expires in 7 days. If you didn't expect this email, you can ignore it.</p>`;
  await resend.emails.send({ from: FROM, to, subject: t.subject, html: wrap(t.subject, body) });
}
