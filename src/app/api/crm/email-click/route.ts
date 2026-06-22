/**
 * GET /api/crm/email-click?url=ENCODED_URL&leadId=ID&activityId=ID
 * Email link click tracking — no auth required (called by email clients).
 * Records an EMAIL_CLICK activity then redirects to the destination URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  // Validate scheme — only allow http(s) to prevent open-redirect to malicious schemes
  if (!destinationUrl.startsWith("http://") && !destinationUrl.startsWith("https://")) {
    return NextResponse.json({ error: "Invalid URL scheme" }, { status: 400 });
  }

  // Fire-and-forget: log click activity if lead exists
  prisma.lead
    .findUnique({ where: { id: leadId }, select: { id: true } })
    .then(lead => {
      if (!lead) return;
      return prisma.leadActivity.create({
        data: {
          leadId,
          type:     "EMAIL_CLICK",
          content:  destinationUrl,
          metadata: JSON.stringify({ url: destinationUrl, activityId }),
        },
      });
    })
    .catch(() => {});

  return NextResponse.redirect(destinationUrl, 302);
}
