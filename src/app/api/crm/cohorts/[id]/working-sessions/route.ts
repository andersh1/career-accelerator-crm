import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fromEasternNaive } from "@/lib/timezone";
import { planWorkingSessions } from "@/lib/working-session-plan";

/**
 * POST /api/crm/cohorts/[id]/working-sessions
 *   { timeOfDay?, durationMins?, offsetDays?, apply? }
 *
 * Generate the cohort's five working sessions from its own module schedule.
 * See src/lib/working-session-plan.ts for the cadence and why it anchors on
 * when a module OPENS rather than on its live session.
 *
 * Dry run unless `apply`, like the schedule generator: five Fellow-facing
 * sessions is not something to create by accident.
 *
 * Created as DRAFTS. The Sessions tab already has the "Show to Fellows"
 * control, and a generated session should be read before anyone can see it —
 * especially the titles, which are a template's guess at what this cohort's
 * week is about.
 *
 * A module that already has a session is left alone rather than duplicated.
 * Fellowship 2 runs its sessions twice over, at 1pm and 7pm, which this
 * generator does not reproduce: that was particular to a cohort with Fellows
 * overseas. Their existing pairs are untouched.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as {
    timeOfDay?: string; durationMins?: number; offsetDays?: number; apply?: boolean;
  };
  const timeOfDay = /^\d{1,2}:\d{2}$/.test(body.timeOfDay ?? "") ? body.timeOfDay! : "13:00";
  const durationMins = Number.isInteger(body.durationMins) ? body.durationMins! : 60;

  const cohort = await prisma.cohort.findUnique({
    where: { id: params.id }, select: { id: true, name: true, track: true },
  });
  if (!cohort) return NextResponse.json({ error: "No such cohort" }, { status: 404 });

  const scheds = await prisma.cohortSchedule.findMany({
    where: { cohortId: params.id },
    select: { startDate: true, module: { select: { id: true, number: true } } },
  });
  if (scheds.length === 0) {
    return NextResponse.json({
      error: "This cohort has no module schedule yet, so there is nothing to anchor the sessions to. Generate the schedule first.",
    }, { status: 400 });
  }

  const plan = planWorkingSessions({
    track: cohort.track,
    schedules: scheds.map(s => ({ moduleNumber: s.module.number, startDate: s.startDate })),
    timeOfDay, durationMins, offsetDays: body.offsetDays,
  });

  const moduleIdByNumber = new Map(scheds.map(s => [s.module.number, s.module.id]));
  const existing = await prisma.liveSession.findMany({
    where: { cohortId: params.id },
    select: { id: true, moduleId: true, title: true, startsAt: true },
  });

  // A module counts as already covered if a session is tagged to it, or if one
  // sits on the same Eastern day as the planned one — which is how the existing
  // hand-built sessions are recognised before anything has been tagged.
  const dayOf = (d: Date | null) =>
    d ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d) : "";

  const rows = plan.sessions.map(s => {
    const moduleId = moduleIdByNumber.get(s.moduleNumber) ?? null;
    const naive = `${s.startsAt.toISOString().slice(0, 10)}T${String(s.startsAt.getUTCHours()).padStart(2, "0")}:${String(s.startsAt.getUTCMinutes()).padStart(2, "0")}`;
    const startsAt = fromEasternNaive(naive);
    const already = existing.find(e =>
      (moduleId && e.moduleId === moduleId) || dayOf(e.startsAt) === dayOf(startsAt));
    return { ...s, moduleId, startsAt, existingId: already?.id ?? null, existingTitle: already?.title ?? null };
  });

  const toCreate = rows.filter(r => !r.existingId);

  if (!body.apply) {
    return NextResponse.json({
      dryRun: true, cohort: cohort.name, track: cohort.track,
      wouldCreate: toCreate.length,
      sessions: rows.map(r => ({
        moduleNumber: r.moduleNumber, title: r.title, kind: r.kind,
        startsAt: r.startsAt, durationMins: r.durationMins,
        status: r.existingId ? "already there" : "new",
        existingTitle: r.existingTitle,
      })),
      skipped: plan.skipped,
    });
  }

  for (const r of toCreate) {
    await prisma.liveSession.create({
      data: {
        cohortId: params.id, moduleId: r.moduleId, title: r.title, kind: r.kind,
        summary: r.summary, startsAt: r.startsAt, durationMins: r.durationMins,
        optional: true,
        published: false, // read it before a Fellow can
      },
    });
  }

  // Tag the ones that were already there, so the Overview's journey card can
  // find them. Harmless when they are already tagged.
  for (const r of rows) {
    if (r.existingId && r.moduleId) {
      await prisma.liveSession.updateMany({
        where: { id: r.existingId, moduleId: null }, data: { moduleId: r.moduleId },
      });
    }
  }

  return NextResponse.json({
    created: toCreate.length,
    tagged: rows.filter(r => r.existingId).length,
    skipped: plan.skipped,
    note: "Created as drafts. Publish them on the Sessions tab when the titles read right.",
  });
}
