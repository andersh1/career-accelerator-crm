import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { defaultPreambleDate } from "@/lib/preamble-date";
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

  // The deck and recording live as Resources on each module's RECORDING
  // section in the LMS, tagged with the cohort whose session they are. Reading
  // them here is a plain lookup with no invariants to break; WRITING them goes
  // through the LMS route, for the reasons in src/lib/recording-sync.ts.
  const [modules, schedules, recordingSections] = await Promise.all([
    prisma.module.findMany({ orderBy: { number: "asc" }, select: { id: true, number: true, title: true } }),
    prisma.cohortSchedule.findMany({ where: { cohortId: params.id } }),
    prisma.section.findMany({
      where:  { type: "RECORDING" },
      select: {
        moduleId: true,
        resources: { where: { cohortId: params.id }, select: { type: true, url: true } },
      },
    }),
  ]);

  const scheduleMap = new Map(schedules.map(s => [s.moduleId, s]));
  const mediaMap = new Map(recordingSections.map(s => [s.moduleId, {
    recordingUrl: s.resources.find(r => r.type === "VIDEO")?.url ?? null,
    deckUrl:      s.resources.find(r => r.type === "LINK")?.url  ?? null,
  }]));

  const result = modules.map(m => {
    const override = scheduleMap.get(m.id);
    return {
      moduleId:        m.id,
      moduleNumber:    m.number,
      moduleTitle:     m.title,
      // The module unlock gate (src/lib/module-access.ts in the LMS). It used
      // to be settable only in the LMS, so a cohort built here inherited the
      // previous cohort's global Module.startDate without anything saying so.
      startDate:       override?.startDate       ?? null,
      assignmentDue:   override?.assignmentDue   ?? null,
      titleOverride:   override?.titleOverride   ?? null,
      preworkDue:      override?.preworkDue      ?? null,
      sessionDate:     override?.sessionDate     ?? null,
      sessionLocation: override?.sessionLocation ?? null,
      sessionZoomLink: override?.sessionZoomLink ?? null,
      preambleDate:    override?.preambleDate    ?? null,
      preambleSentAt:  override?.preambleSentAt  ?? null,
      preambleSkipped: override?.preambleSkipped ?? false,
      deckUrl:         mediaMap.get(m.id)?.deckUrl      ?? null,
      recordingUrl:    mediaMap.get(m.id)?.recordingUrl ?? null,
    };
  });

  return NextResponse.json(result);
}

// PATCH /api/crm/cohorts/[id]/schedule
// Body: { moduleId, startDate?, preworkDue?, sessionDate?, assignmentDue?,
//          sessionLocation?, sessionZoomLink?, preambleDate?, titleOverride? }
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
  if (has("startDate"))       patch.startDate       = dateOrNull(body.startDate);
  if (has("assignmentDue"))   patch.assignmentDue   = dateOrNull(body.assignmentDue);
  if (has("titleOverride"))   patch.titleOverride   = (body.titleOverride as string)?.trim() || null;
  if (has("preambleSkipped")) patch.preambleSkipped = !!body.preambleSkipped;
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

  /**
   * Setting a pre-work deadline implies when the kick-off goes out, so fill it
   * in rather than leaving another date to remember per module per cohort.
   *
   * Only ever fills a BLANK one. An explicit date, or one already sent, is
   * never overwritten — a schedule tweak in week six must not silently move a
   * kick-off someone deliberately placed.
   */
  if (has("preworkDue") && !has("preambleDate")) {
    const existing = await prisma.cohortSchedule.findUnique({
      where: { cohortId_moduleId: { cohortId: params.id, moduleId } },
      select: { preambleDate: true, preambleSentAt: true },
    });
    if (!existing?.preambleDate && !existing?.preambleSentAt) {
      const suggested = defaultPreambleDate(patch.preworkDue as Date | null);
      // Never schedule one into the past: the cron would fire it on its next
      // run, mailing the cohort about a module whose deadline has gone.
      if (suggested && suggested.getTime() > Date.now()) patch.preambleDate = suggested;
    }
  }

  const schedule = await prisma.cohortSchedule.upsert({
    where:  { cohortId_moduleId: { cohortId: params.id, moduleId } },
    create: { cohortId: params.id, moduleId, ...patch },
    update: patch,
  });

  return NextResponse.json(schedule);
}
