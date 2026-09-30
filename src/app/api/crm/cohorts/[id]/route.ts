import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fromEasternNaive } from "@/lib/timezone";

// PATCH /api/crm/cohorts/[id]  { name?, isActive?, capacity?, startDate?, track?,
//                                orientationDate?, orientationZoomLink?, orientationDeckUrl? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const updated = await prisma.cohort.update({
    where: { id: params.id },
    data: {
      ...(body.name      !== undefined && { name:      body.name.trim() }),
      ...(body.isActive  !== undefined && { isActive:  body.isActive }),
      // Only the two known tracks; anything else is ignored rather than stored.
      ...(body.track     !== undefined && (body.track === "PRIVATE" || body.track === "COHORT")
          && { track: body.track }),
      ...(body.founderMode !== undefined && { founderMode: !!body.founderMode }),
      ...(body.capacity  !== undefined && { capacity:  body.capacity ? parseInt(body.capacity) : null }),
      ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate + "T12:00:00.000Z") : null }),
      // Orientation lived only in the LMS, so setting up a cohort meant crossing
      // apps for one date and one link. Times are Eastern wall-clock, like every
      // other schedule field.
      ...(body.orientationDate !== undefined && {
        orientationDate: body.orientationDate ? fromEasternNaive(body.orientationDate) : null }),
      ...(body.orientationZoomLink !== undefined && { orientationZoomLink: body.orientationZoomLink?.trim() || null }),
      ...(body.orientationDeckUrl !== undefined && { orientationDeckUrl: body.orientationDeckUrl?.trim() || null }),
      // Null falls back to the shared slack_invite_url AppSetting in the LMS.
      ...(body.slackInviteUrl !== undefined && { slackInviteUrl: body.slackInviteUrl?.trim() || null }),
    },
  });

  return NextResponse.json(updated);
}
