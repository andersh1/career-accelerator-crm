import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM   = process.env.RESEND_FROM_EMAIL ?? "Vantage Career Accelerator <onboarding@resend.dev>";
const CRM_SECRET = process.env.CRON_SECRET ?? "";

function dateStr(d: Date, tz: string) {
  return d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz,
  });
}
function timeStr(d: Date, tz: string) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: tz });
}

function buildReminderHtml(opts: {
  firstName: string;
  type: "SEVEN_DAY" | "ONE_DAY" | "FOLLOW_UP";
  eventTitle: string;
  eventType: string;
  startsAt: Date;
  timezone: string;
  location: string | null;
  venueAddress: string | null;
  meetingUrl: string | null;
  speakerName: string | null;
}): { subject: string; html: string } {
  const { firstName, type, eventTitle, eventType, startsAt, timezone, location,
    venueAddress, meetingUrl, speakerName } = opts;
  const isZoom = eventType === "ZOOM";
  const date   = dateStr(startsAt, timezone);
  const time   = timeStr(startsAt, timezone);

  if (type === "FOLLOW_UP") {
    return {
      subject: `Thanks for attending: ${eventTitle}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#14211f;">
          <div style="background:#0a6b64;padding:20px 28px;border-radius:12px 12px 0 0;">
            <h2 style="color:white;margin:0;font-size:1.1rem;">Thanks for joining us, ${firstName}!</h2>
          </div>
          <div style="border:1px solid #e4e0d6;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px;">
            <p style="margin:0 0 16px;">We hope <strong>${eventTitle}</strong> gave you a clear sense of what the Vantage Career Accelerator can do for your career.</p>
            <p style="margin:0 0 20px;">If you're serious about landing a role you're excited about, the next step is to apply. Seats in each cohort are limited.</p>
            <a href="https://lms.vantagecareer.co/apply" style="display:inline-block;background:#0a6b64;color:white;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;font-size:0.9rem;">Apply Now →</a>
            <p style="margin:24px 0 0;font-size:0.875rem;color:#5a6663;">Questions? Simply reply to this email — we read every one.</p>
          </div>
        </div>
      `,
    };
  }

  const headline = type === "ONE_DAY"
    ? `Tomorrow: ${eventTitle}`
    : `One week away: ${eventTitle}`;
  const body = type === "ONE_DAY"
    ? `Your event is <strong>tomorrow</strong>. Here's everything you need:`
    : `Just a friendly reminder — <strong>${eventTitle}</strong> is coming up in one week.`;

  const locationBlock = isZoom
    ? (meetingUrl
        ? `<tr><td style="padding:8px 0;color:#5a6663;font-size:0.875rem;width:110px;">Join link</td><td style="padding:8px 0;"><a href="${meetingUrl}" style="color:#0a6b64;font-weight:700;">${meetingUrl}</a></td></tr>`
        : `<tr><td style="padding:8px 0;color:#5a6663;font-size:0.875rem;">Format</td><td style="padding:8px 0;font-weight:600;">Online via Zoom — link coming soon</td></tr>`)
    : [
        location ? `<tr><td style="padding:8px 0;color:#5a6663;font-size:0.875rem;width:110px;">Venue</td><td style="padding:8px 0;font-weight:600;">${location}</td></tr>` : "",
        venueAddress ? `<tr><td style="padding:8px 0;color:#5a6663;font-size:0.875rem;">Address</td><td style="padding:8px 0;">${venueAddress}</td></tr>` : "",
      ].join("");

  return {
    subject: headline,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#14211f;">
        <div style="background:#0a6b64;padding:20px 28px;border-radius:12px 12px 0 0;">
          <p style="color:rgba(255,255,255,0.7);margin:0 0 4px;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;">
            ${type === "ONE_DAY" ? "⏰ Reminder — Tomorrow" : "📅 Reminder — One Week Away"}
          </p>
          <h2 style="color:white;margin:0;font-size:1.15rem;">${eventTitle}</h2>
        </div>
        <div style="border:1px solid #e4e0d6;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px;">
          <p style="margin:0 0 20px;">Hi ${firstName}, ${body}</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <tr><td style="padding:8px 0;color:#5a6663;font-size:0.875rem;width:110px;">Date</td><td style="padding:8px 0;font-weight:600;">${date}</td></tr>
            <tr><td style="padding:8px 0;color:#5a6663;font-size:0.875rem;">Time</td><td style="padding:8px 0;font-weight:600;">${time}</td></tr>
            ${locationBlock}
            ${speakerName ? `<tr><td style="padding:8px 0;color:#5a6663;font-size:0.875rem;">Speaker</td><td style="padding:8px 0;font-weight:600;">${speakerName}</td></tr>` : ""}
          </table>
          <p style="margin:0;font-size:0.875rem;color:#5a6663;">Questions? Reply to this email.</p>
        </div>
      </div>
    `,
  };
}

// POST /api/crm/events/[id]/remind
// Body: { type: "SEVEN_DAY" | "ONE_DAY" | "FOLLOW_UP" }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!resend) return NextResponse.json({ error: "Email not configured" }, { status: 503 });

  const { type } = await req.json();
  if (!["SEVEN_DAY", "ONE_DAY", "FOLLOW_UP"].includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: { registrations: { select: { firstName: true, email: true, attendedAt: true } } },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // For follow-up: only send to those who attended; for reminders: all registrants
  const recipients = type === "FOLLOW_UP"
    ? event.registrations.filter(r => r.attendedAt)
    : event.registrations;

  let sent = 0;
  for (const reg of recipients) {
    const { subject, html } = buildReminderHtml({
      firstName:   reg.firstName,
      type:        type as "SEVEN_DAY" | "ONE_DAY" | "FOLLOW_UP",
      eventTitle:  event.title,
      eventType:   event.eventType,
      startsAt:    event.startsAt,
      timezone:    event.timezone,
      location:    event.location,
      venueAddress: event.venueAddress,
      meetingUrl:  event.meetingUrl,
      speakerName: event.speakerName,
    });
    try {
      await resend.emails.send({ from: FROM, to: reg.email, subject, html });
      sent++;
    } catch { /* continue */ }
  }

  // Mark the reminder flag on the event
  const flagMap = { SEVEN_DAY: "reminderSent7d", ONE_DAY: "reminderSent24h", FOLLOW_UP: "followUpSent" } as const;
  await prisma.event.update({ where: { id: params.id }, data: { [flagMap[type as keyof typeof flagMap]]: true } });

  return NextResponse.json({ sent, total: recipients.length });
}
