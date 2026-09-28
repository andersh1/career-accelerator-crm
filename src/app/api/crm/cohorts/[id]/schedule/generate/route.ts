/**
 * POST /api/crm/cohorts/[id]/schedule/generate
 *
 * Lay out a cohort's whole schedule from the first session plus a cadence,
 * instead of forty dates typed one at a time across two apps.
 *
 * Always previews first. `apply: true` is what writes, and it refuses to write
 * a plan that fails validation, so an impossible schedule — pre-work due after
 * its own session, a kick-off email about a deadline that has passed — cannot
 * be saved by clicking through quickly.
 *
 * A module whose kick-off has already gone out is never touched: `preambleDate`
 * is left alone wherever `preambleSentAt` is set, because moving it would not
 * un-send the email and would make the record lie about what Fellows received.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fromEasternNaive } from "@/lib/timezone";
import {
  planSchedule, validatePlan, DEFAULT_OFFSETS,
  type ScheduleOffsets, type PlannedModule,
} from "@/lib/schedule-plan";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    firstSession?: string;
    cadenceWeeks?: number;
    breakAfter?: number[];
    offsets?: Partial<ScheduleOffsets>;
    sessionZoomLink?: string | null;
    sessionLocation?: string | null;
    apply?: boolean;
  };

  if (!body.firstSession || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body.firstSession)) {
    return NextResponse.json({ error: "Pick the date and time of the first session." }, { status: 400 });
  }

  const cohort = await prisma.cohort.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!cohort) return NextResponse.json({ error: "No such cohort" }, { status: 404 });

  const modules = await prisma.module.findMany({
    orderBy: { number: "asc" },
    select: { id: true, number: true, title: true },
  });

  const offsets: ScheduleOffsets = {
    unlock:     { ...DEFAULT_OFFSETS.unlock,     ...(body.offsets?.unlock     ?? {}) },
    prework:    { ...DEFAULT_OFFSETS.prework,    ...(body.offsets?.prework    ?? {}) },
    preamble:   { ...DEFAULT_OFFSETS.preamble,   ...(body.offsets?.preamble   ?? {}) },
    assignment: { ...DEFAULT_OFFSETS.assignment, ...(body.offsets?.assignment ?? {}) },
  };

  let plan: PlannedModule[];
  try {
    plan = planSchedule({
      firstSession:    body.firstSession,
      cadenceWeeks:    body.cadenceWeeks && body.cadenceWeeks > 0 ? body.cadenceWeeks : 1,
      breakAfter:      body.breakAfter,
      offsets,
      sessionZoomLink: body.sessionZoomLink,
      sessionLocation: body.sessionLocation,
      moduleCount:     modules.length,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not build the schedule" }, { status: 400 });
  }

  const errors = validatePlan(plan);

  // What is already there, so the preview can say what would change and the
  // write can leave a sent kick-off alone.
  const existing = await prisma.cohortSchedule.findMany({
    where: { cohortId: params.id },
    select: { moduleId: true, preambleSentAt: true },
  });
  const sentByModule = new Map(existing.map(e => [e.moduleId, e.preambleSentAt]));
  const byNumber = new Map(modules.map(m => [m.number, m]));

  const rows = plan.map(p => {
    const mod = byNumber.get(p.moduleNumber)!;
    const alreadySent = sentByModule.get(mod.id) ?? null;
    return {
      ...p,
      moduleId:     mod.id,
      moduleTitle:  mod.title,
      // Surfaced so the preview can show why a row's kick-off date is unchanged.
      preambleLocked: !!alreadySent,
      preambleSentAt: alreadySent,
    };
  });

  if (!body.apply) {
    return NextResponse.json({ preview: true, cohort: cohort.name, rows, errors });
  }

  if (errors.length) {
    return NextResponse.json({ error: "That schedule has problems.", errors }, { status: 400 });
  }

  let written = 0;
  for (const r of rows) {
    const data: Record<string, unknown> = {
      startDate:       fromEasternNaive(r.startDate),
      preworkDue:      fromEasternNaive(r.preworkDue),
      sessionDate:     fromEasternNaive(r.sessionDate),
      assignmentDue:   fromEasternNaive(r.assignmentDue),
      sessionZoomLink: r.sessionZoomLink,
      sessionLocation: r.sessionLocation,
    };
    // Never move a kick-off that has already gone out.
    if (!r.preambleLocked) data.preambleDate = fromEasternNaive(r.preambleDate);

    await prisma.cohortSchedule.upsert({
      where:  { cohortId_moduleId: { cohortId: params.id, moduleId: r.moduleId } },
      create: { cohortId: params.id, moduleId: r.moduleId, ...data },
      update: data,
    });
    written++;
  }

  return NextResponse.json({
    ok: true,
    cohort: cohort.name,
    written,
    preambleSkipped: rows.filter(r => r.preambleLocked).map(r => r.moduleNumber),
  });
}
