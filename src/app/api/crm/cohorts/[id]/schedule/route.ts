import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fromEasternNaive } from "@/lib/timezone";

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
      preambleDate:    override?.preambleDate    ?? null,
      preambleSentAt:  override?.preambleSentAt  ?? null,
    };
  });

  return NextResponse.json(result);
}

// PATCH /api/crm/cohorts/[id]/schedule
// Body: { moduleId, preworkDue?, sessionDate?, sessionLocation?, sessionZoomLink? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { moduleId } = body;

  if (!moduleId) return NextResponse.json({ error: "moduleId required" }, { status: 400 });

  // Only touch the fields actually sent. This used to null anything omitted, so
  // a caller updating one date would silently wipe the session date and Zoom
  // link alongside it.
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const dateOrNull = (v: unknown) => (v ? fromEasternNaive(v as string) : null);
  const patch: Record<string, unknown> = {};
  if (has("preworkDue"))      patch.preworkDue      = dateOrNull(body.preworkDue);
  if (has("sessionDate"))     patch.sessionDate     = dateOrNull(body.sessionDate);
  if (has("sessionLocation")) patch.sessionLocation = body.sessionLocation || null;
  if (has("sessionZoomLink")) patch.sessionZoomLink = body.sessionZoomLink || null;
  if (has("preambleDate")) {
    patch.preambleDate = dateOrNull(body.preambleDate);
    // Rescheduling a preamble that already went out should not re-send it, so
    // preambleSentAt is only cleared when explicitly asked for.
    if (body.resendPreamble === true) patch.preambleSentAt = null;
  }

  const schedule = await prisma.cohortSchedule.upsert({
    where:  { cohortId_moduleId: { cohortId: params.id, moduleId } },
    create: { cohortId: params.id, moduleId, ...patch },
    update: patch,
  });

  return NextResponse.json(schedule);
}
