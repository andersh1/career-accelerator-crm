import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/crm/cohorts
export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || (role !== "ADMIN" && role !== "MEMBER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cohorts = await prisma.cohort.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      // Withdrawn Fellows are not enrolled. Counting them overstates the
      // roster and quietly corrupts fill % and spots-left, which is what
      // capacity decisions are made from.
      _count: { select: { users: { where: { withdrawnAt: null } } } },
    },
  });

  return NextResponse.json(cohorts.map(c => ({
    id:        c.id,
    name:      c.name,
    isActive:  c.isActive,
    track:     c.track,
    orientationDate:     c.orientationDate,
    orientationZoomLink: c.orientationZoomLink,
    orientationDeckUrl:  c.orientationDeckUrl,
    slackInviteUrl:      c.slackInviteUrl,
    founderMode: c.founderMode,
    capacity:  c.capacity,
    startDate: c.startDate,
    createdAt: c.createdAt,
    publishedAt: c.publishedAt,
    invitesSent: c.invitesSent,
    enrolled:  c._count.users,
    fillPct:   c.capacity ? Math.round((c._count.users / c.capacity) * 100) : null,
    spotsLeft: c.capacity != null ? Math.max(0, c.capacity - c._count.users) : null,
  })));
}

// POST /api/crm/cohorts  { name, capacity?, startDate?, track? }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, capacity, startDate, track } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const cohort = await prisma.cohort.create({
    data: {
      name:      name.trim(),
      capacity:  capacity ? parseInt(capacity) : null,
      startDate: startDate ? new Date(startDate + "T12:00:00.000Z") : null,
      // COHORT unless explicitly told otherwise — see the LMS src/lib/track.ts.
      // A bad value would silently switch off the hot seat and peer roster for
      // a real group, so only the two known strings are accepted.
      track:     track === "PRIVATE" ? "PRIVATE" : "COHORT",
      isActive:  true,
    },
  });

  return NextResponse.json({ ...cohort, enrolled: 0, fillPct: null, spotsLeft: cohort.capacity }, { status: 201 });
}
