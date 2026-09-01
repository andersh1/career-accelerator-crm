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

/**
 * The Resend SDK resolves with { data, error } rather than throwing, so an
 * unchecked send makes a rejected email look delivered. Route sends through
 * this so failures are logged instead of vanishing.
 */
async function sendChecked(args: Parameters<NonNullable<typeof resend>["emails"]["send"]>[0]): Promise<void> {
  if (!resend) {
    console.error("[email] RESEND_API_KEY is not set — skipping send");
    return;
  }
  const { error } = await resend.emails.send(args);
  if (error) {
    console.error("[email] send failed:", JSON.stringify(error));
    throw new Error(`Resend rejected send: ${error.message ?? JSON.stringify(error)}`);
  }
}

function wrap(title: string, body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f1efe8;font-family:'Montserrat','Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1efe8;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4e0d6;box-shadow:0 2px 12px rgba(20,33,31,0.06);">
      <tr><td style="background:linear-gradient(135deg,#086c64,#063f3a);padding:30px 36px;">
        <img src="https://lms.vantagecareer.co/email-logo-white.png" alt="Vantage Career" height="30" style="display:block;height:30px;width:auto;margin-bottom:18px;"/>
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.35;">${title}</h1>
      </td></tr>
      <tr><td style="padding:34px 36px;">${body}</td></tr>
      <tr><td style="padding:22px 36px;border-top:1px solid #e4e0d6;background:#f8f6f1;">
        <p style="margin:0 0 4px;color:#5a6663;font-size:12px;font-weight:600;text-align:center;">Vantage Career Accelerator</p>
        <p style="margin:0;color:#949598;font-size:11px;text-align:center;">Launch your career the way a founder launches a company · <a href="${LMS_URL}" style="color:#086c64;text-decoration:none;font-weight:600;">Open your workspace</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

const CRM_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";


/** Send a test render of a DB template (sample data) to an admin's inbox. */
export async function sendTemplateTest(key: string, to: string): Promise<{ ok: boolean; reason?: string }> {
  if (!resend) return { ok: false, reason: "Email not configured" };
  const SAMPLES: Record<string, { vars: Record<string, string>; cta?: string; ctaUrl?: string }> = {
    "intake-confirmation": { vars: { firstName: "Jordan" } },
    "student-invite": {
      vars: { firstName: "Jordan", cohortLine: "You're in **Career Accelerator — Cohort 2** — orientation is Tuesday, September 1." },
      cta: "Set up my account →", ctaUrl: LMS_URL,
    },
    "prework-reminder": {
      vars: { firstName: "Jordan", moduleNumber: "1", moduleTitle: "Self", dueDate: "Sunday, September 6" },
      cta: "Go to Pre-work →", ctaUrl: `${LMS_URL}/modules`,
    },
    "session-reminder": {
      vars: { firstName: "Jordan", moduleNumber: "1", moduleTitle: "Self", sessionDate: "Tuesday, Sep 8 · 6:30 PM ET" },
      cta: "Open Dashboard →", ctaUrl: `${LMS_URL}/dashboard`,
    },
    "re-engagement": { vars: { firstName: "Jordan" }, cta: "Open Dashboard →", ctaUrl: `${LMS_URL}/dashboard` },
    "assignment-reminder": {
      vars: { firstName: "Jordan", moduleNumber: "1", moduleTitle: "Self", dueDate: "tomorrow night — Friday, September 11" },
      cta: "Open the Assignment →", ctaUrl: `${LMS_URL}/modules`,
    },
  };
  const sample = SAMPLES[key];
  if (!sample) return { ok: false, reason: "No test sample for this template" };
  const row = await prisma.emailTemplate.findUnique({ where: { key }, select: { subject: true, body: true } });
  if (!row) return { ok: false, reason: "Template not found" };
  const subject = subVars(row.subject, sample.vars);
  const button = sample.cta
    ? `<a href="${sample.ctaUrl}" style="display:inline-block;background:#086c64;color:#fff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;text-decoration:none;">${sample.cta}</a>`
    : "";
  const html = wrap(subject, textToHtml(subVars(row.body, sample.vars)) + button);
  const { error } = await resend.emails.send({ from: FROM, to, subject: `[TEST] ${subject}`, html });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

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
    await sendChecked({ from: FROM, to, subject, html: wrap(subject, body) });
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
    await sendChecked({ from: FROM, to, subject, html: wrap(subject, htmlBody) + pixel + (unsubHtml ?? "") });
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
  await sendChecked({ from: FROM, to, subject: t.subject, html: wrap(t.subject, t.bodyHtml) });
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
  await sendChecked({ from: FROM, to, subject, html: wrap(subject, body) });
}

export async function sendAdminApplicationAlert({
  firstName, lastName, email, phone, leadId, notes,
}: {
  firstName: string; lastName: string; email: string; phone: string | null;
  leadId: string; notes: string | null;
}) {
  if (!resend) return;
  const subject = `New application: ${firstName} ${lastName}`;
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
    await sendChecked({
      from: FROM,
      to: ["caleb@vantagecareer.co", "dan@vantagecareer.co"],
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
  await sendChecked({ from: FROM, to, subject, html: wrap(subject, body) });
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
    await sendChecked({ from: FROM, to, subject, html: wrap(subject, body) });
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
    // The template greets with {{firstName}}. Passing the whole name rendered
    // "Matthew Schreiber — welcome." instead of "Matthew — welcome."
    firstName: (studentName || "there").trim().split(/\s+/)[0],
    cohortLine: cohort ? `You've been enrolled in **${cohort}**.` : "",
  });
  if (!t) return; // switched off in the Email Playbook
  const body = `${t.bodyHtml}
    <a href="${resetUrl}" style="display:inline-block;margin:8px 0 24px;background:#086c64;color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">
      Set up my account →
    </a>
    <p style="margin:0;color:#94a3b8;font-size:12px;">This link expires in 7 days. If you didn't expect this email, you can ignore it.</p>`;
  await sendChecked({ from: FROM, to, subject: t.subject, html: wrap(t.subject, body) });
}

// ─────────────────────────────────────────────────────────────────────────────
// Website funnel (consultation + stay in touch)
//
// These send from the CRM so the copy lives in Automation → Email Playbook
// alongside the student emails. The LMS website posts to /api/public/intake
// and this file does the sending.
// ─────────────────────────────────────────────────────────────────────────────

const SITE_URL = process.env.SITE_URL ?? "https://vantagecareer.co";
const CONSULT_CALENDLY_URL =
  process.env.CONSULT_CALENDLY_URL ?? "https://calendly.com/dan-sommer/vantage-consultation";

/** Who gets internal lead alerts. Comma separated; defaults to Dan + Caleb. */
export const LEAD_ALERT_EMAILS = (
  process.env.LEAD_ALERT_EMAILS ?? "dan@vantagecareer.co,caleb@vantagecareer.co"
).split(",").map(s => s.trim()).filter(Boolean);

const ctaButton = (href: string, label: string) =>
  `<p style="margin:26px 0 0;"><a href="${href}" style="display:inline-block;background:#086c64;color:#fff;font-weight:700;font-size:15px;padding:14px 30px;border-radius:999px;text-decoration:none;">${label}</a></p>`;

/** Confirmation to someone who requested a consultation. */
export async function sendConsultationConfirmation({
  to, firstName, isParent, alreadyBooked,
}: { to: string; firstName: string; isParent: boolean; alreadyBooked?: boolean }) {
  const t = await renderTemplate("consultation-confirmation", {
    subject: "Your Vantage consultation — next steps",
    body: `Hi {{firstName}},\n\nThanks for reaching out about the Vantage Fellowship. Your request is in.\n\n**What happens next:** a 30-minute conversation with Dan Sommer, who founded and led Trilogy Education to a $750M exit and now coaches every Fellow personally. He'll walk through what the eight weeks cover and give you a straight answer on whether it's a fit for {{who}} — no pressure, no pitch.\n\nJust reply to this email if anything comes up before you talk.`,
  }, { firstName, who: isParent ? "your student" : "you" });
  if (!t) return; // switched off in the Email Playbook

  const body = t.bodyHtml + (alreadyBooked ? "" : ctaButton(CONSULT_CALENDLY_URL, "Choose a Time →"));
  await sendChecked({ from: FROM, to, subject: t.subject, html: wrap(t.subject, body) });
}

/** Confirmation to someone who joined the mailing list. */
export async function sendStayInTouchConfirmation({
  to, firstName,
}: { to: string; firstName: string }) {
  const t = await renderTemplate("stay-in-touch-confirmation", {
    subject: "You're on the Vantage list",
    body: `Hi {{firstName}},\n\nYou're on the list. We'll send the occasional note on how students actually stand out in this job market — plus first word when new Fellowship dates open.\n\nNo spam, and you can unsubscribe any time.`,
  }, { firstName });
  if (!t) return;

  await sendChecked({
    from: FROM, to, subject: t.subject,
    html: wrap(t.subject, t.bodyHtml + ctaButton(SITE_URL, "Explore the Fellowship →")),
  });
}

const alertRow = (label: string, value: string) =>
  `<tr><td style="padding:6px 0;color:#5a6663;font-size:13px;width:150px;">${label}</td><td style="padding:6px 0;font-weight:600;font-size:14px;">${value}</td></tr>`;

/**
 * Internal alert when someone submits a website form. Deliberately not a
 * Playbook template — it is a structured field table, and it should not be
 * possible to switch your own lead notifications off by accident.
 */
export async function sendLeadAlert({
  firstName, lastName, email, phone, personaRole, academicYear, isSchedule, leadId,
}: {
  firstName: string; lastName: string; email: string; phone?: string | null;
  personaRole?: string | null; academicYear?: string | null; isSchedule: boolean; leadId?: string | null;
}) {
  const label = isSchedule ? "Consultation request" : "Stay in Touch signup";
  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${alertRow("Name", `${firstName} ${lastName}`)}
      ${personaRole ? alertRow("Role", personaRole === "PARENT" ? "Parent" : "Student") : ""}
      ${alertRow("Email", `<a href="mailto:${email}" style="color:#086c64;">${email}</a>`)}
      ${phone ? alertRow("Phone", `<a href="tel:${phone}" style="color:#086c64;">${phone}</a>`) : ""}
      ${academicYear ? alertRow("Academic year", academicYear) : ""}
    </table>
    ${isSchedule ? `<p style="margin:22px 0 0;color:#5a6663;font-size:14px;">They were sent to the scheduling link. You'll get a separate note if and when they actually book.</p>` : ""}
    ${leadId ? ctaButton(`${CRM_URL}/leads/${leadId}`, "Open in CRM →") : ""}`;
  await sendChecked({
    from: FROM, to: LEAD_ALERT_EMAILS,
    subject: `${isSchedule ? "📅" : "✉️"} ${label} — ${firstName} ${lastName}`,
    html: wrap(label, body),
  });
}

/** Internal alert when a consultation is actually booked on Calendly. */
export async function sendConsultationBookedAlert({
  name, email, startTime, joinUrl, leadId, isNewLead,
}: {
  name: string; email: string; startTime: Date; joinUrl?: string | null;
  leadId?: string | null; isNewLead?: boolean;
}) {
  const when = startTime.toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: "America/New_York",
  });
  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${alertRow("Name", name)}
      ${alertRow("Email", `<a href="mailto:${email}" style="color:#086c64;">${email}</a>`)}
      ${alertRow("When", when)}
      ${joinUrl ? alertRow("Join", `<a href="${joinUrl}" style="color:#086c64;">Meeting link</a>`) : ""}
    </table>
    ${isNewLead ? `<p style="margin:22px 0 0;color:#5a6663;font-size:14px;">They booked without going through the website form, so a new lead was created for them.</p>` : ""}
    ${leadId ? ctaButton(`${CRM_URL}/leads/${leadId}`, "Open in CRM →") : ""}`;
  await sendChecked({
    from: FROM, to: LEAD_ALERT_EMAILS,
    subject: `✅ Consultation booked — ${name}`,
    html: wrap("Consultation booked", body),
  });
}
