import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM   = process.env.RESEND_FROM_EMAIL ?? "Vantage Career Accelerator <hello@vantagecareer.co>";

function fmt(d: Date, tz: string, mode: "date" | "time") {
  return mode === "date"
    ? d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz })
    : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: tz });
}

function reminderHtml(ev: {
  title: string; eventType: string; startsAt: Date; timezone: string;
  location: string | null; venueAddress: string | null; meetingUrl: string | null;
  speakerName: string | null;
}, firstName: string, type: "SEVEN_DAY" | "ONE_DAY") {
  const isZoom = ev.eventType === "ZOOM";
  const date = fmt(ev.startsAt, ev.timezone, "date");
  const time = fmt(ev.startsAt, ev.timezone, "time");
  const label = type === "ONE_DAY" ? "⏰ Tomorrow" : "📅 One Week Away";
  const intro = type === "ONE_DAY"
    ? `Your event is <strong>tomorrow</strong>. Here's everything you need:`
    : `Just a friendly reminder — your event is coming up in one week.`;
  const locationRow = isZoom
    ? (ev.meetingUrl ? `<tr><td style="padding:7px 14px;color:#5a6663;font-size:.875rem;width:110px;">Join link</td><td style="padding:7px 14px;"><a href="${ev.meetingUrl}" style="color:#086c64;font-weight:700;">${ev.meetingUrl}</a></td></tr>` : `<tr><td style="padding:7px 14px;color:#5a6663;font-size:.875rem;">Format</td><td style="padding:7px 14px;font-weight:600;">Online via Zoom</td></tr>`)
    : [ev.location ? `<tr><td style="padding:7px 14px;color:#5a6663;font-size:.875rem;width:110px;">Venue</td><td style="padding:7px 14px;font-weight:600;">${ev.location}</td></tr>` : "", ev.venueAddress ? `<tr><td style="padding:7px 14px;color:#5a6663;font-size:.875rem;">Address</td><td style="padding:7px 14px;">${ev.venueAddress}</td></tr>` : ""].join("");
  return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#14211f;"><div style="background:linear-gradient(135deg,#086c64,#063b37);padding:20px 28px;border-radius:12px 12px 0 0;"><p style="color:rgba(255,255,255,.65);margin:0 0 4px;font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;">${label}</p><h2 style="color:#fff;margin:0;font-size:1.1rem;">${ev.title}</h2></div><div style="border:1px solid #e4e0d6;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px;background:#fff;"><p style="margin:0 0 20px;">Hi ${firstName}, ${intro}</p><table style="width:100%;border-collapse:collapse;margin-bottom:20px;border:1px solid #e4e0d6;border-radius:8px;overflow:hidden;"><tr style="background:#f8f6f1;"><td style="padding:7px 14px;color:#5a6663;font-size:.875rem;width:110px;">Date</td><td style="padding:7px 14px;font-weight:600;">${date}</td></tr><tr style="background:#fff;"><td style="padding:7px 14px;color:#5a6663;font-size:.875rem;">Time</td><td style="padding:7px 14px;font-weight:600;">${time}</td></tr>${locationRow}${ev.speakerName ? `<tr style="background:#f8f6f1;"><td style="padding:7px 14px;color:#5a6663;font-size:.875rem;">Speaker</td><td style="padding:7px 14px;font-weight:600;">${ev.speakerName}</td></tr>` : ""}</table><p style="margin:0;font-size:.875rem;color:#5a6663;">Questions? Reply to this email.</p></div></div>`;
}

// GET /api/cron/event-reminders — called daily by Vercel cron
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!resend) return NextResponse.json({ error: "Email not configured" }, { status: 503 });

  const now       = new Date();
  const window7d  = { gte: new Date(now.getTime() + 6.5 * 86400000), lte: new Date(now.getTime() + 7.5 * 86400000) };
  const window24h = { gte: new Date(now.getTime() + 0.5 * 86400000), lte: new Date(now.getTime() + 1.5 * 86400000) };

  const [seven, one] = await Promise.all([
    prisma.event.findMany({ where: { active: true, reminderSent7d: false,  startsAt: window7d  }, include: { registrations: { select: { firstName: true, email: true } } } }),
    prisma.event.findMany({ where: { active: true, reminderSent24h: false, startsAt: window24h }, include: { registrations: { select: { firstName: true, email: true } } } }),
  ]);

  let sent7 = 0, sent24 = 0;

  for (const ev of seven) {
    for (const r of ev.registrations) {
      try {
        await resend.emails.send({ from: FROM, to: r.email, subject: `One week away: ${ev.title}`, html: reminderHtml(ev, r.firstName, "SEVEN_DAY") });
        sent7++;
      } catch { /* continue */ }
    }
    await prisma.event.update({ where: { id: ev.id }, data: { reminderSent7d: true } });
  }

  for (const ev of one) {
    for (const r of ev.registrations) {
      try {
        await resend.emails.send({ from: FROM, to: r.email, subject: `Tomorrow: ${ev.title}`, html: reminderHtml(ev, r.firstName, "ONE_DAY") });
        sent24++;
      } catch { /* continue */ }
    }
    await prisma.event.update({ where: { id: ev.id }, data: { reminderSent24h: true } });
  }

  return NextResponse.json({ sent7d: sent7, sent24h: sent24, events7d: seven.length, events24h: one.length });
}
