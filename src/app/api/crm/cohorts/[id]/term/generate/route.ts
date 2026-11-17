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
import { planTerm, validateTerm, type PlannedSession, type TermPlanInput } from "@/lib/term-plan";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as Partial<TermPlanInput> & { apply?: boolean };

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

  let plan: PlannedSession[];
  try {
    plan = planTerm({
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

  const modules = await prisma.module.findMany({ select: { id: true, number: true, title: true } });
  const moduleByNumber = new Map(modules.map(m => [m.number, m]));

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

  if (!body.apply) {
    return NextResponse.json({
      preview: true,
      cohort: cohort.name,
      sessions: rows.length,
      weeks: new Set(rows.map(r => r.week)).size,
      rows,
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
    provisionedLeftAlone: rows.filter(r => r.provisioned).map(r => r.sequence),
    orphans,
  });
}
