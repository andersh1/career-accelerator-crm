/**
 * GET /api/crm/email-open?aid=ACTIVITY_ID
 * Tracking pixel endpoint — returns a 1x1 transparent PNG and records the open.
 * Embedded as <img> in outgoing HTML emails.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 1x1 transparent PNG (base64)
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

export async function GET(req: NextRequest) {
  const aid = req.nextUrl.searchParams.get("aid");

  if (aid) {
    // Fire-and-forget: mark the activity as opened
    prisma.leadActivity.updateMany({
      where: { id: aid, openedAt: null },
      data:  { openedAt: new Date() },
    }).catch(() => {});
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type":  "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma":        "no-cache",
    },
  });
}
