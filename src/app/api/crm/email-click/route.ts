/**
 * GET /api/crm/email-click?url=ENCODED_URL&leadId=ID&activityId=ID
 * Email link click tracking — no auth required (called by email clients).
 * Records an EMAIL_CLICK activity then redirects to the destination URL.
 *
 * The destination host is CHECKED AGAINST AN ALLOWLIST. It used to be enough
 * for the URL to start with http:// or https://, which made this an open
 * redirect on our own domain: anyone could hand out a link that genuinely
 * began https://crm.vantagecareer.co/ and landed wherever they liked. A real
 * leadId was not even needed, because the lead lookup below is optional. That
 * is a phishing primitive wearing our brand, and it burns the sending
 * reputation of vantagecareer.co. Found in the 2026-11-06 audit.
 *
 * If we ever need to track a click through to a host that is not on this
 * list, add it here deliberately. Do not widen the check to "any https URL" —
 * that is the bug.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Hosts we are willing to send a recipient to from our own domain. An entry
 * matches the host itself and its subdomains, so "vantagecareer.co" covers
 * lms. and crm. too.
 */
const ALLOWED_HOSTS = [
  "vantagecareer.co",
  "career-accelerator-crm.vercel.app",
  "career-accelerator-lms.vercel.app",
  "calendly.com",
  "zoom.us",
  "slack.com",
  "google.com",        // docs/drive/meet/calendar links we send
  "youtube.com",
  "youtu.be",
  "loom.com",
  "vimeo.com",
];

function isAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => h === allowed || h.endsWith(`.${allowed}`));
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const encodedUrl  = searchParams.get("url");
  const leadId      = searchParams.get("leadId");
  const activityId  = searchParams.get("activityId");

  if (!encodedUrl || !leadId) {
    return NextResponse.json({ error: "Missing url or leadId" }, { status: 400 });
  }

  let destinationUrl: string;
  try {
    destinationUrl = decodeURIComponent(encodedUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url encoding" }, { status: 400 });
  }

  // Parse rather than string-match: a parsed URL cannot be fooled by the
  // userinfo and backslash tricks that "starts with https://" misses, such as
  // https://crm.vantagecareer.co@evil.example.com/.
  let parsed: URL;
  try {
    parsed = new URL(destinationUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Invalid URL scheme" }, { status: 400 });
  }

  if (!isAllowed(parsed.hostname)) {
    // A real recipient should never reach this: every link we send goes to a
    // host on the list. Say where they were headed rather than leaving them
    // at a bare error, and do not follow the link for them.
    console.warn("[email-click] refused redirect to unlisted host:", parsed.hostname);
    return new NextResponse(
      `This link points to ${parsed.hostname}, which is not a destination Vantage Career sends people to. ` +
        `It has not been followed. If you were expecting this link, please check with whoever sent it.`,
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  // Await before redirecting — fire-and-forget doesn't complete in serverless after response is sent
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } }).catch(() => null);
  if (lead) {
    await prisma.leadActivity.create({
      data: {
        leadId,
        type:     "EMAIL_CLICK",
        content:  destinationUrl,
        metadata: JSON.stringify({ url: destinationUrl, activityId }),
      },
    }).catch(() => {});
  }

  return NextResponse.redirect(parsed.toString(), 302);
}
