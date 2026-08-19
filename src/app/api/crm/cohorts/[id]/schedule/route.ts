import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") return null;
  return session;
}

// GET /api/crm/cohorts/[id]/schedule
// Returns all modules with their per-cohort schedule overrides merged in
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [modules, schedules] = await Promise.all([
    prisma.module.findMany({ orderBy: { number: "asc" }, select: { id: true, number: true, title: true } }),
    prisma.cohortSchedule.findMany({ where: { cohortId: params.id } }),
  ]);

  const scheduleMap = new Map(schedules.map(s => [s.moduleId, s]));

  const result = modules.map(m => {
    const override = scheduleMap.get(m.id);
    return {
      moduleId:        m.id,
      moduleNumber:    m.number,
      moduleTitle:     m.title,
      preworkDue:      override?.preworkDue      ?? null,
      sessionDate:     override?.sessionDate     ?? null,
      sessionLocation: override?.sessionLocation ?? null,
      sessionZoomLink: override?.sessionZoomLink ?? null,
    };
  });

  return NextResponse.json(result);
}

// PATCH /api/crm/cohorts/[id]/schedule
// Body: { moduleId, preworkDue?, sessionDate?, sessionLocation?, sessionZoomLink? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { moduleId, preworkDue, sessionDate, sessionLocation, sessionZoomLink } = body;

  if (!moduleId) return NextResponse.json({ error: "moduleId required" }, { status: 400 });

  const schedule = await prisma.cohortSchedule.upsert({
    where:  { cohortId_moduleId: { cohortId: params.id, moduleId } },
    create: {
      cohortId: params.id,
      moduleId,
      preworkDue:      preworkDue      ? new Date(preworkDue)      : null,
      sessionDate:     sessionDate     ? new Date(sessionDate)     : null,
      sessionLocation: sessionLocation || null,
      sessionZoomLink: sessionZoomLink || null,
    },
    update: {
      preworkDue:      preworkDue      ? new Date(preworkDue)      : null,
      sessionDate:     sessionDate     ? new Date(sessionDate)     : null,
      sessionLocation: sessionLocation || null,
      sessionZoomLink: sessionZoomLink || null,
    },
  });

  return NextResponse.json(schedule);
}
