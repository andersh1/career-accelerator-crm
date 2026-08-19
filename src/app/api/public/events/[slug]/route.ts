import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM   = process.env.RESEND_FROM_EMAIL ?? "Vantage Career Accelerator <hello@vantagecareer.co>";

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z/, "Z");
}

function generateICS(event: {
  title: string; description: string | null; eventType: string;
  location: string | null; venueAddress: string | null; meetingUrl: string | null;
  startsAt: Date; endsAt: Date | null;
}) {
  const end = event.endsAt || new Date(event.startsAt.getTime() + 2 * 60 * 60 * 1000);
  const loc = event.eventType === "ZOOM"
    ? (event.meetingUrl || "Online via Zoom")
    : [event.location, event.venueAddress].filter(Boolean).join(", ");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vantage Career Accelerator//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `DTSTART:${icsDate(event.startsAt)}`,
    `DTEND:${icsDate(end)}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `UID:${Date.now()}@lms.vantagecareer.co`,
    `SUMMARY:${event.title}`,
    loc ? `LOCATION:${loc.replace(/\n/g, " ")}` : "",
    event.description ? `DESCRIPTION:${event.description.replace(/\n/g, "\\n").replace(/,/g, "\\,")}` : "",
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

function buildConfirmationHtml(opts: {
  firstName: string; eventTitle: string; eventType: string;
  dateStr: string; timeStr: string;
  location: string | null; venueAddress: string | null; meetingUrl: string | null;
  speakerName: string | null; speakerTitle: string | null;
  confirmationMessage: string | null;
}) {
  const { firstName, eventTitle, eventType, dateStr, timeStr, location,
    venueAddress, meetingUrl, speakerName, speakerTitle, confirmationMessage } = opts;
  const isZoom = eventType === "ZOOM";

  const locationRow = isZoom
    ? (meetingUrl
        ? `<tr><td style="padding:7px 0;color:#5a6663;font-size:0.875rem;width:110px;vertical-align:top;">Join link</td><td style="padding:7px 0;"><a href="${meetingUrl}" style="color:#0a6b64;font-weight:700;word-break:break-all;">${meetingUrl}</a></td></tr>`
        : `<tr><td style="padding:7px 0;color:#5a6663;font-size:0.875rem;">Format</td><td style="padding:7px 0;font-weight:600;">Online via Zoom — link sent before event</td></tr>`)
    : [
        location ? `<tr><td style="padding:7px 0;color:#5a6663;font-size:0.875rem;width:110px;">Venue</td><td style="padding:7px 0;font-weight:600;">${location}</td></tr>` : "",
        venueAddress ? `<tr><td style="padding:7px 0;color:#5a6663;font-size:0.875rem;">Address</td><td style="padding:7px 0;">${venueAddress}</td></tr>` : "",
      ].join("");

  const speakerRow = speakerName
    ? `<tr><td style="padding:7px 0;color:#5a6663;font-size:0.875rem;">Speaker</td><td style="padding:7px 0;font-weight:600;">${speakerName}${speakerTitle ? ` — ${speakerTitle}` : ""}</td></tr>`
    : "";

  const reminderNote = isZoom
    ? "We'll send the Zoom link again 24 hours before — check your spam folder if you don't see it."
    : "We'll send a reminder 24 hours before with full logistics.";

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#14211f;">
      <div style="background:linear-gradient(135deg,#0a6b64,#063b37);padding:24px 28px;border-radius:12px 12px 0 0;">
        <p style="color:rgba(255,255,255,0.65);margin:0 0 6px;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;">You're registered</p>
        <h2 style="color:white;margin:0;font-size:1.25rem;line-height:1.3;">${eventTitle}</h2>
        <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:0.875rem;">Vantage Career Accelerator</p>
      </div>
      <div style="border:1px solid #e4e0d6;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px;background:#fff;">
        <p style="margin:0 0 20px;">Hi ${firstName} 👋 — you're all set for <strong>${eventTitle}</strong>. Here are your details:</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;border:1px solid #e4e0d6;border-radius:10px;overflow:hidden;">
          <tr style="background:#f8f6f1;">
            <td colspan="2" style="padding:10px 14px;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#8a938f;">Event Details</td>
          </tr>
          <tr style="background:#fff;"><td style="padding:7px 14px;color:#5a6663;font-size:0.875rem;width:110px;">Date</td><td style="padding:7px 14px;font-weight:600;">${dateStr}</td></tr>
          <tr style="background:#f8f6f1;"><td style="padding:7px 14px;color:#5a6663;font-size:0.875rem;">Time</td><td style="padding:7px 14px;font-weight:600;">${timeStr}</td></tr>
          ${locationRow ? `<tr style="background:#fff;">${locationRow.replace(/<tr[^>]*>|<\/tr>/g, "")}</tr>` : ""}
          ${speakerRow ? `<tr style="background:#f8f6f1;">${speakerRow.replace(/<tr[^>]*>|<\/tr>/g, "")}</tr>` : ""}
        </table>
        ${confirmationMessage ? `<p style="margin:0 0 20px;padding:16px;background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;font-size:0.9rem;">${confirmationMessage}</p>` : ""}
        <p style="margin:0 0 8px;font-size:0.875rem;color:#5a6663;">📅 <strong>Add to your calendar</strong> — the .ics file is attached to this email.</p>
        <p style="margin:0;font-size:0.875rem;color:#5a6663;">${reminderNote}</p>
        <hr style="border:none;border-top:1px solid #e4e0d6;margin:20px 0;" />
        <p style="margin:0;font-size:0.8rem;color:#8a938f;">Questions? Reply to this email — we read every one.<br/>Vantage Career Accelerator · <a href="https://lms.vantagecareer.co" style="color:#0a6b64;">lms.vantagecareer.co</a></p>
      </div>
    </div>
  `;
}

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const event = await prisma.event.findUnique({
    where: { slug: params.slug, active: true },
    select: {
      id: true, slug: true, title: true, description: true, eventType: true,
      speakerName: true, speakerBio: true, speakerTitle: true, speakerImageUrl: true,
      location: true, venueAddress: true, startsAt: true, endsAt: true, timezone: true,
      maxCapacity: true, visibility: true, confirmationMessage: true,
      meetingUrl: true,
      _count: { select: { registrations: true } },
    },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });

  // Don't expose meeting URL publicly before registration
  const { meetingUrl: _hidden, ...safeEvent } = event;
  return NextResponse.json(safeEvent, { headers: CORS });
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const event = await prisma.event.findUnique({
    where: { slug: params.slug, active: true },
    select: {
      id: true, title: true, description: true, eventType: true,
      startsAt: true, endsAt: true, timezone: true,
      location: true, venueAddress: true, meetingUrl: true,
      maxCapacity: true, visibility: true, confirmationMessage: true,
      speakerName: true, speakerTitle: true,
      _count: { select: { registrations: true } },
    },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404, headers: CORS });

  if (event.maxCapacity && event._count.registrations >= event.maxCapacity) {
    return NextResponse.json({ error: "This event is full. Please check back for future sessions." }, { status: 409, headers: CORS });
  }

  const body = await req.json().catch(() => ({}));
  const { firstName, lastName, email, phone, contactType,
    utmSource, utmMedium, utmCampaign, referralCode } = body;

  if (!firstName?.trim()) return NextResponse.json({ error: "First name required" }, { status: 400, headers: CORS });
  if (!lastName?.trim())  return NextResponse.json({ error: "Last name required" }, { status: 400, headers: CORS });
  if (!email?.trim() || !email.includes("@")) return NextResponse.json({ error: "Valid email required" }, { status: 400, headers: CORS });

  const normalizedEmail = (email as string).toLowerCase().trim();
  const isParent = contactType === "PARENT";

  let reg;
  try {
    reg = await prisma.eventRegistration.create({
      data: {
        eventId:      event.id,
        firstName:    firstName.trim(),
        lastName:     lastName.trim(),
        email:        normalizedEmail,
        phone:        phone?.trim() || null,
        contactType:  isParent ? "PARENT" : "STUDENT",
        utmSource:    utmSource  || null,
        utmMedium:    utmMedium  || null,
        utmCampaign:  utmCampaign || null,
        referralCode: referralCode?.toUpperCase() || null,
      },
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ ok: true, alreadyRegistered: true }, { headers: CORS });
    }
    throw e;
  }

  // Upsert CRM lead (fire-and-forget)
  (async () => {
    try {
      const existing = await prisma.lead.findFirst({ where: { email: normalizedEmail }, select: { id: true } });
      let leadId: string;
      if (existing) {
        leadId = existing.id;
        await prisma.leadActivity.create({
          data: { leadId, type: "NOTE", content: `${isParent ? "[Parent] " : ""}Registered for event: ${event.title}` },
        });
      } else {
        const lead = await prisma.lead.create({
          data: {
            firstName:    firstName.trim(),
            lastName:     lastName.trim(),
            email:        normalizedEmail,
            phone:        phone?.trim() || null,
            source:       "EVENT",
            leadType:     "WAITLIST",
            stage:        "LEAD",
            utmSource:    utmSource  || null,
            utmMedium:    utmMedium  || null,
            utmCampaign:  utmCampaign || null,
            referralCode: referralCode?.toUpperCase() || null,
            notes:        `${isParent ? "[Parent] " : ""}Registered for event: ${event.title}`,
          },
        });
        leadId = lead.id;
        await prisma.leadActivity.create({
          data: { leadId, type: "CREATED", content: `${isParent ? "[Parent] " : ""}Registered for event: ${event.title}` },
        });
      }
      if (reg) {
        await prisma.eventRegistration.update({ where: { id: reg.id }, data: { leadId } });
      }
    } catch { /* non-fatal */ }
  })();

  // Send confirmation email with .ics calendar attachment
  if (resend) {
    const dateStr = event.startsAt.toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: event.timezone,
    });
    const timeStr = event.startsAt.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: event.timezone,
    });

    const icsContent = generateICS({
      title:        event.title,
      description:  event.description,
      eventType:    event.eventType,
      location:     event.location,
      venueAddress: event.venueAddress,
      meetingUrl:   event.meetingUrl,
      startsAt:     event.startsAt,
      endsAt:       event.endsAt,
    });

    const html = buildConfirmationHtml({
      firstName:           firstName.trim(),
      eventTitle:          event.title,
      eventType:           event.eventType,
      dateStr,
      timeStr,
      location:            event.location,
      venueAddress:        event.venueAddress,
      meetingUrl:          event.meetingUrl,
      speakerName:         event.speakerName,
      speakerTitle:        event.speakerTitle,
      confirmationMessage: event.confirmationMessage,
    });

    resend.emails.send({
      from: FROM,
      to:   normalizedEmail,
      subject: `You're registered: ${event.title}`,
      html,
      attachments: [{
        filename:     "event.ics",
        content:      Buffer.from(icsContent).toString("base64"),
        content_type: "text/calendar",
      }],
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true }, { headers: CORS });
}
