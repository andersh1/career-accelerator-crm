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
      _count: { select: { users: true } },
    },
  });

  return NextResponse.json(cohorts.map(c => ({
    id:        c.id,
    name:      c.name,
    isActive:  c.isActive,
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

// POST /api/crm/cohorts  { name, capacity? }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, capacity, startDate } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const cohort = await prisma.cohort.create({
    data: {
      name:      name.trim(),
      capacity:  capacity ? parseInt(capacity) : null,
      startDate: startDate ? new Date(startDate + "T12:00:00.000Z") : null,
      isActive:  true,
    },
  });

  return NextResponse.json({ ...cohort, enrolled: 0, fillPct: null, spotsLeft: cohort.capacity }, { status: 201 });
}
