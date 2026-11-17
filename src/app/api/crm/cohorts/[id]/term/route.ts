/**
 * The term: one row per class meeting, for a university cohort.
 *
 *   GET   /api/crm/cohorts/[id]/term          read the 28 meetings
 *   PATCH /api/crm/cohorts/[id]/term          edit one meeting by its sequence
 *
 * The generator next door lays the term out. This is for the single row somebody
 * fixes afterwards: a room number, a link pasted by hand, a date Wake moved.
 *
 * Mirrors the Schedule tab's endpoints deliberately, including admin-only access
 * and naive Eastern date strings in and out, so there is one way these things
 * work rather than two.
 */
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

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cohort = await prisma.cohort.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, track: true },
  });
  if (!cohort) return NextResponse.json({ error: "No such cohort" }, { status: 404 });

  /**
   * Other university classes whose term can be copied as the shape for this one.
   *
   * This is the onboarding path for the next school: the shape of a course that
   * is already running, started on a different date. Returned with the term so
   * the tab does not need a second request, and empty until there is a second
   * class, which is honest rather than an empty menu.
   */
  const copySources = await prisma.cohort.findMany({
    where:  { track: "UNIVERSITY", id: { not: params.id }, sessions: { some: {} } },
    select: { id: true, name: true, _count: { select: { sessions: true } } },
    orderBy: { startDate: "desc" },
  });

  const sessions = await prisma.cohortSession.findMany({
    where:   { cohortId: params.id },
    orderBy: { sequence: "asc" },
    include: {
      module: { select: { number: true, title: true } },
      _count: { select: { attendance: true } },
    },
  });

  return NextResponse.json({
    cohort: { id: cohort.id, name: cohort.name, track: cohort.track },
    copySources: copySources.map(c => ({ id: c.id, name: c.name, sessions: c._count.sessions })),
    // An empty array is a real answer here: a university cohort whose term has
    // not been generated yet. The caller should offer the generator, not an
    // error.
    sessions: sessions.map(s => ({
      id:            s.id,
      sequence:      s.sequence,
      week:          s.week,
      kind:          s.kind,
      labKind:       s.labKind,
      title:         s.title,
      moduleNumber:  s.module?.number ?? null,
      moduleTitle:   s.module?.title ?? null,
      startsAt:      s.startsAt,
      preworkDue:    s.preworkDue,
      ticketIn:      s.ticketIn,
      minutes:       s.minutes,
      location:      s.location,
      zoomLink:      s.zoomLink,
      provisionedAt: s.provisionedAt,
      recordingUrl:  s.recordingUrl,
      deckUrl:       s.deckUrl,
      // Admin-only, and it stays that way: the LMS never renders this to a
      // student. See the private notes boundary.
      facilitatorNote: s.facilitatorNote,
      attendanceMarked: s._count.attendance,
    })),
  });
}

/** Fields a human may edit on one meeting. Dates arrive as naive ET strings. */
interface TermPatch {
  sequence: number;
  title?: string;
  startsAt?: string | null;
  preworkDue?: string | null;
  ticketIn?: string | null;
  minutes?: number | null;
  location?: string | null;
  zoomLink?: string | null;
  facilitatorNote?: string | null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as TermPatch;
  if (typeof body.sequence !== "number") {
    return NextResponse.json({ error: "Which meeting? Pass its sequence." }, { status: 400 });
  }

  const existing = await prisma.cohortSession.findUnique({
    where:  { cohortId_sequence: { cohortId: params.id, sequence: body.sequence } },
    select: { id: true, startsAt: true, provisionedAt: true },
  });
  if (!existing) return NextResponse.json({ error: `This cohort has no meeting ${body.sequence}.` }, { status: 404 });

  const naive = (v: string | null | undefined) => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new Error(`"${v}" is not a YYYY-MM-DDTHH:MM date and time.`);
    return fromEasternNaive(v);
  };

  let data: Record<string, unknown>;
  try {
    data = {
      ...(body.title           !== undefined ? { title: body.title.trim() } : {}),
      ...(body.ticketIn        !== undefined ? { ticketIn: body.ticketIn?.trim() || null } : {}),
      ...(body.minutes         !== undefined ? { minutes: body.minutes } : {}),
      ...(body.location        !== undefined ? { location: body.location?.trim() || null } : {}),
      ...(body.zoomLink        !== undefined ? { zoomLink: body.zoomLink?.trim() || null } : {}),
      ...(body.facilitatorNote !== undefined ? { facilitatorNote: body.facilitatorNote?.trim() || null } : {}),
      ...(body.startsAt        !== undefined ? { startsAt: naive(body.startsAt) } : {}),
      ...(body.preworkDue      !== undefined ? { preworkDue: naive(body.preworkDue) } : {}),
    };
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bad date" }, { status: 400 });
  }

  const updated = await prisma.cohortSession.update({
    where: { id: existing.id },
    data,
  });

  /**
   * Moving a meeting that already has a Zoom room and a calendar event does not
   * move either of them. Said plainly rather than left for somebody to discover
   * when twenty students turn up at the old time.
   */
  const warning = existing.provisionedAt && body.startsAt !== undefined &&
    existing.startsAt?.getTime() !== updated.startsAt?.getTime()
      ? "This meeting already has a Zoom room and a calendar event at the old time. Re-provision the term so the invitations move too."
      : null;

  return NextResponse.json({ ok: true, session: updated, warning });
}
