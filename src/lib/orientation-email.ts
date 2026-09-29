/**
 * The email that goes out before orientation.
 *
 * There was a hole in the sequence: the invite says "set up your account", and
 * the Module 1 kick-off already assumes orientation has happened ("the
 * recording is on your dashboard"). Nothing told a Fellow when orientation was
 * or what the weeks after it look like.
 *
 * The schedule is built from the cohort's own rows rather than typed into the
 * copy, so it cannot drift from what the LMS will actually do, and one template
 * serves a Tuesday-evening group cohort and a Monday-morning private client
 * without being edited.
 *
 * Live sessions and working sessions are listed separately because they are
 * different commitments: the live session is the module itself with Dan, the
 * working session is optional hands-on time with Caleb. A Fellow reading one
 * undifferentiated list cannot tell which is which.
 */
import { prisma } from "@/lib/prisma";

/** Why each module exists, in one line, in the voice of this email. */
const MODULE_REASON: Record<number, string> = {
  1: "Where you are strongest, with evidence behind it.",
  2: "What the market actually needs, from the people doing the work.",
  3: "Narrowing to one seat worth going after.",
  4: "Proving it by building a small version of the real work.",
  5: "One sentence about you, said the same way everywhere it appears.",
  6: "Getting into the right rooms on purpose.",
  7: "The numbers behind the life you are building.",
  8: "Who is in your corner for the long run.",
};

/** Module 8 is not Demo Day for a private client. */
const MODULE_8_PRIVATE = "What changed, what held, and the plan for what comes next.";

const ET = "America/New_York";

function when(d: Date | null): string {
  if (!d) return "date to come";
  return d.toLocaleString("en-US", {
    timeZone: ET, weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }) + " ET";
}

function day(d: Date | null): string {
  if (!d) return "date to come";
  return d.toLocaleString("en-US", { timeZone: ET, weekday: "short", month: "short", day: "numeric" });
}

export interface OrientationEmailParts {
  orientationWhen: string;
  orientationZoom: string | null;
  liveSessions: string;
  workingSessions: string;
  hasWorkingSessions: boolean;
}

/**
 * Assemble the cohort-specific pieces. Plain text with markdown bold, which is
 * what the template renderer already understands.
 */
export async function orientationEmailParts(cohortId: string): Promise<OrientationEmailParts | null> {
  const cohort = await prisma.cohort.findUnique({
    where: { id: cohortId },
    select: { track: true, orientationDate: true, orientationZoomLink: true },
  });
  if (!cohort) return null;

  const [schedule, sessions] = await Promise.all([
    prisma.cohortSchedule.findMany({
      where: { cohortId },
      orderBy: { module: { number: "asc" } },
      select: {
        sessionDate: true, assignmentDue: true, titleOverride: true,
        module: { select: { number: true, title: true } },
      },
    }),
    prisma.liveSession.findMany({
      where: { cohortId },
      orderBy: { startsAt: "asc" },
      select: { title: true, summary: true, startsAt: true },
    }),
  ]);

  const isPrivate = cohort.track === "PRIVATE";

  const liveSessions = schedule
    .filter(s => s.sessionDate)
    .map(s => {
      const title = s.titleOverride ?? s.module.title;
      const reason = s.module.number === 8 && isPrivate
        ? MODULE_8_PRIVATE
        : MODULE_REASON[s.module.number] ?? "";
      const due = s.assignmentDue ? `  ·  assignment due ${day(s.assignmentDue)}` : "";
      return `**${day(s.sessionDate)}** — Module ${s.module.number}: ${title}\n${reason}${due}`;
    })
    .join("\n\n");

  const workingSessions = sessions
    .map(s => {
      // The time is already in the title, so strip it rather than print it twice.
      const clean = s.title.replace(/\s*\([^)]*ET\)\s*$/, "").trim();
      return `**${day(s.startsAt)}** — ${clean}\n${s.summary ?? ""}`.trimEnd();
    })
    .join("\n\n");

  return {
    orientationWhen: when(cohort.orientationDate),
    orientationZoom: cohort.orientationZoomLink,
    liveSessions,
    workingSessions,
    hasWorkingSessions: sessions.length > 0,
  };
}
