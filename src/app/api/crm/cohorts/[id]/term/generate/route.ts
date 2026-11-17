/**
 * POST /api/crm/cohorts/[id]/term/generate
 *
 * Lay out a university term's twenty-eight meetings from one date, instead of
 * twenty-eight rows typed by hand.
 *
 * Always previews first. `apply: true` is what writes, and it refuses to write a
 * plan that fails validation, so a term that meets on three different weekdays
 * or has pre-work due after its own class cannot be saved by clicking through
 * quickly. Same contract as the eight-module schedule generator next door.
 *
 * TWO REFUSALS WORTH READING.
 *
 * It only works on a cohort whose track is UNIVERSITY. The eight-module cohorts
 * keep their calendar in CohortSchedule, and writing sessions for one of them
 * would give it two calendars that disagree. There are live Fellows and two
 * private clients on that path; this endpoint cannot touch them.
 *
 * It never overwrites what provisioning or a human put on a session that already
 * exists: the Zoom meeting and calendar event ids, the link, the recording, the
 * deck, the facilitator note. Regenerating dates is a common thing to do in
 * December and January, and it must not detach a session from the Zoom meeting
 * students already have in their diary.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fromEasternNaive } from "@/lib/timezone";
import {
  planTerm, planModules, validateTerm, templateFromSessions, TERM_TEMPLATES,
  type PlannedSession, type TermPlanInput, type TermWeekTemplate,
} from "@/lib/term-plan";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as Partial<TermPlanInput> & {
    apply?: boolean;
    /** A shape from TERM_TEMPLATES. Defaults to the Vantage 14-week course. */
    templateKey?: string;
    /**
     * Or: another university cohort whose saved term is the shape to copy.
     *
     * This is how the next school is onboarded. Nothing but the shape comes
     * across: no dates, no Zoom links, no rooms, no recordings. Takes precedence
     * over templateKey, since copying a real term is more specific than picking
     * a built-in one.
     */
    copyFromCohortId?: string;
  };

  if (!body.firstMeeting || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body.firstMeeting)) {
    return NextResponse.json({ error: "Pick the date and time of the first class." }, { status: 400 });
  }

  const cohort = await prisma.cohort.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, track: true },
  });
  if (!cohort) return NextResponse.json({ error: "No such cohort" }, { status: 404 });
  if (cohort.track !== "UNIVERSITY") {
    return NextResponse.json({
      error: `${cohort.name} is a ${cohort.track.toLowerCase()} cohort. Its schedule is one row per module, set on the Schedule tab. Only a university class is laid out as twenty-eight meetings.`,
    }, { status: 400 });
  }

  const modules = await prisma.module.findMany({ select: { id: true, number: true, title: true } });
  const moduleByNumber = new Map(modules.map(m => [m.number, m]));

  /**
   * Which shape this term takes: a copy of another class's term, or a built-in.
   */
  let template: TermWeekTemplate[] | undefined;
  let shapeFrom = TERM_TEMPLATES["vantage-14-week"].label;

  if (body.copyFromCohortId) {
    const source = await prisma.cohort.findUnique({
      where:  { id: body.copyFromCohortId },
      select: {
        name: true, track: true,
        sessions: {
          orderBy: { sequence: "asc" },
          select: { sequence: true, week: true, kind: true, labKind: true,
                    title: true, moduleId: true, startsAt: true },
        },
      },
    });
    if (!source) return NextResponse.json({ error: "No such cohort to copy from." }, { status: 400 });
    if (source.sessions.length === 0) {
      return NextResponse.json({ error: `${source.name} has no term to copy.` }, { status: 400 });
    }
    template = templateFromSessions(source.sessions, new Map(modules.map(m => [m.id, m.number])));
    shapeFrom = `a copy of ${source.name}`;
  } else if (body.templateKey) {
    const chosen = TERM_TEMPLATES[body.templateKey];
    if (!chosen) {
      return NextResponse.json({
        error: `No term shape called "${body.templateKey}". Known shapes: ${Object.keys(TERM_TEMPLATES).join(", ")}.`,
      }, { status: 400 });
    }
    template = chosen.weeks;
    shapeFrom = chosen.label;
  }

  let plan: PlannedSession[];
  try {
    plan = planTerm({
      template,
      firstMeeting:    body.firstMeeting,
      secondDayOffset: body.secondDayOffset,
      minutes:         body.minutes,
      preworkOffset:   body.preworkOffset,
      labTicketOffset: body.labTicketOffset,
      zoomLink:        body.zoomLink,
      location:        body.location,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not build the term" }, { status: 400 });
  }

  const errors = validateTerm(plan);

  const wanted = plan.map(s => s.moduleNumber).filter((n): n is number => n !== null);
  const missing = Array.from(new Set(wanted)).filter(n => !moduleByNumber.has(n));
  if (missing.length) errors.push(`No module ${missing.join(", ")} exists yet, so those weeks have nothing to point at.`);

  // What is already there, so the preview can say what would change and the
  // write can leave provisioning and anything a human typed alone.
  const existing = await prisma.cohortSession.findMany({
    where: { cohortId: params.id },
    select: {
      sequence: true, startsAt: true, zoomMeetingId: true, calendarEventId: true,
      provisionedAt: true, recordingUrl: true, deckUrl: true, facilitatorNote: true,
    },
  });
  const bySequence = new Map(existing.map(e => [e.sequence, e]));

  const rows = plan.map(s => {
    const was = bySequence.get(s.sequence);
    return {
      ...s,
      moduleId:    s.moduleNumber === null ? null : moduleByNumber.get(s.moduleNumber)?.id ?? null,
      moduleTitle: s.moduleNumber === null ? null : moduleByNumber.get(s.moduleNumber)?.title ?? null,
      /** Surfaced so the preview shows which meetings already have a Zoom room. */
      provisioned: !!was?.provisionedAt,
      /** The date this session has now, so a regeneration shows what moves. */
      currentStartsAt: was?.startsAt ?? null,
      isNew: !was,
    };
  });

  /**
   * The modules, derived from the meetings: when each opens, when its one
   * assignment is due, and its share of the grade. A module spans two weeks
   * here, so neither date belongs to any single meeting.
   */
  const moduleRows = planModules(plan).map(m => ({
    ...m,
    moduleId:    moduleByNumber.get(m.moduleNumber)?.id ?? null,
    moduleTitle: moduleByNumber.get(m.moduleNumber)?.title ?? null,
  }));

  if (!body.apply) {
    return NextResponse.json({
      preview: true,
      cohort: cohort.name,
      sessions: rows.length,
      weeks: new Set(rows.map(r => r.week)).size,
      shapeFrom,
      rows,
      modules: moduleRows,
      errors,
    });
  }

  if (errors.length) {
    return NextResponse.json({ error: "That term has problems.", errors }, { status: 400 });
  }

  let written = 0;
  for (const r of rows) {
    // Dates, titles and shape are regenerated. Everything a person or the
    // provisioner put on the row is left exactly as it is.
    const data = {
      moduleId:   r.moduleId,
      kind:       r.kind,
      labKind:    r.labKind,
      title:      r.title,
      // Written so this term can be read back as a shape for the next class.
      week:       r.week,
      startsAt:   fromEasternNaive(r.startsAt),
      preworkDue: fromEasternNaive(r.preworkDue),
      minutes:    r.minutes,
      ...(r.isNew ? { zoomLink: r.zoomLink, location: r.location } : {}),
    };

    await prisma.cohortSession.upsert({
      where:  { cohortId_sequence: { cohortId: params.id, sequence: r.sequence } },
      create: { cohortId: params.id, sequence: r.sequence, ...data },
      update: data,
    });
    written++;
  }

  /**
   * The per-module rows. The weight is only ever written when the row is new, so
   * regenerating the dates in January cannot quietly undo a weight Dan changed.
   */
  let modulesWritten = 0;
  for (const m of moduleRows) {
    if (!m.moduleId) continue;
    const dates = {
      opensAt:       fromEasternNaive(m.opensAt),
      assignmentDue: fromEasternNaive(m.assignmentDue),
    };
    await prisma.cohortModule.upsert({
      where:  { cohortId_moduleId: { cohortId: params.id, moduleId: m.moduleId } },
      create: { cohortId: params.id, moduleId: m.moduleId, ...dates, weightPct: m.weightPct },
      update: dates,
    });
    modulesWritten++;
  }

  /**
   * Anything beyond the template's length is left in place and reported, never
   * deleted. A shorter template does not mean somebody wanted twenty-nine
   * through thirty-two thrown away, and a session may already carry a recording.
   */
  const orphans = existing
    .filter(e => !rows.some(r => r.sequence === e.sequence))
    .map(e => e.sequence);

  return NextResponse.json({
    ok: true,
    cohort: cohort.name,
    written,
    modulesWritten,
    provisionedLeftAlone: rows.filter(r => r.provisioned).map(r => r.sequence),
    orphans,
  });
}
