/**
 * Lay out a university term: fourteen weeks, twenty-eight meetings.
 *
 * `schedule-plan.ts` builds a cohort's schedule from a cadence, because every
 * eight-module cohort has the same shape: one session a week, each session its
 * own module. A three-credit class does not have that shape. It meets twice a
 * week on fixed weekdays, most modules run two weeks, one week is spring break,
 * the two days of each week do different jobs, and the term's dates are set by
 * the university's academic calendar rather than by us.
 *
 * So the term is a TEMPLATE, declared once, with the dates generated from the
 * first meeting. The template says what happens in each week; the generator
 * says when. That split is the point: Dan can move the start date or the break
 * without anybody retyping twenty-eight dates, and the shape of the course
 * cannot drift away from the curriculum map by somebody editing one cell.
 *
 * Pure. Writes nothing, touches no database, and returns naive Eastern strings
 * for the caller to convert at the moment it writes, exactly as the eight-module
 * planner does.
 */
import { fromEasternNaive } from "@/lib/timezone";

/** What kind of meeting this is. Mirrors CohortSession.kind. */
export type SessionKind = "ORIENTATION" | "WORKSHOP" | "LAB" | "DEMO_DAY";

/**
 * What the Do block of a lab looks like. Mirrors CohortSession.labKind.
 *
 * Sprint is rounds of writing and sending, counted out of Networking. Studio is
 * building, with a help order and a stuck queue. Judgment is a draft scored
 * against the rubric before class, which the group then argues with.
 */
export type LabKind = "SPRINT" | "STUDIO" | "JUDGMENT";

export interface TermWeekTemplate {
  /** 1-based teaching week. Break weeks are not teaching weeks and are not here. */
  week: number;
  /** The module this week serves, or null for orientation. */
  moduleNumber: number | null;
  /** What this week is called on the curriculum map. */
  label: string;
  /** The first meeting of the week. Tuesday for Wake. */
  first: { title: string; kind: SessionKind };
  /** The second meeting. Thursday for Wake. */
  second: { title: string; kind: SessionKind; labKind?: LabKind };
  /** A break week falls AFTER this week. */
  breakAfter?: boolean;
}

/**
 * Wake Forest, Spring 2027, from Dan's curriculum map.
 *
 * Fourteen teaching weeks, Tuesday and Thursday, with spring break after week
 * eight. Titles are the map's own, not paraphrases, so the LMS and the sheet say
 * the same thing to the same student.
 *
 * Three things in here are worth knowing rather than discovering later:
 *
 *   Week 1 Tuesday is ORIENTATION, not a workshop. It is the only session that
 *   belongs to no module, which is why CohortSession.moduleId is nullable.
 *
 *   Week 14 is two DEMO_DAY sessions and no lab, because Demo Day is the final
 *   and the room is split across both days (eleven present, then nine and the
 *   close).
 *
 *   Week 12 is still Module 6. The map calls it "(+ Personal Board)" because the
 *   Personal Board work rides along inside Go to Market rather than being a
 *   module of its own.
 */
export const WAKE_SPRING_2027: TermWeekTemplate[] = [
  { week: 1,  moduleNumber: null, label: "Orientation and kick-off",
    first:  { title: "What this course is, and what you leave with", kind: "ORIENTATION" },
    second: { title: "Get set up and start the three inputs", kind: "LAB", labKind: "STUDIO" } },

  { week: 2,  moduleNumber: 1, label: "Module 1, Self (week 1 of 2)",
    first:  { title: "What I believe about myself", kind: "WORKSHOP" },
    second: { title: "What others see", kind: "LAB", labKind: "JUDGMENT" } },

  { week: 3,  moduleNumber: 1, label: "Module 1, Self (week 2 of 2)",
    first:  { title: "Rewrite it and aim it", kind: "WORKSHOP" },
    second: { title: "Stand behind it", kind: "LAB", labKind: "JUDGMENT" } },

  { week: 4,  moduleNumber: 2, label: "Module 2, Discovery (week 1 of 2)",
    first:  { title: "Who to ask and how to ask", kind: "WORKSHOP" },
    second: { title: "Run the call", kind: "LAB", labKind: "SPRINT" } },

  { week: 5,  moduleNumber: 2, label: "Module 2, Discovery (week 2 of 2)",
    first:  { title: "What did you actually hear", kind: "WORKSHOP" },
    second: { title: "Keep it going", kind: "LAB", labKind: "SPRINT" } },

  { week: 6,  moduleNumber: 3, label: "Module 3, Wedge",
    first:  { title: "What a wedge is, and finding yours", kind: "WORKSHOP" },
    second: { title: "Pressure test it and name the firms", kind: "LAB", labKind: "JUDGMENT" } },

  { week: 7,  moduleNumber: 4, label: "Module 4, MVP (week 1 of 2)",
    first:  { title: "Spec it: the pain, and the one thing you will build", kind: "WORKSHOP" },
    second: { title: "Build Studio 1: from spec to something that runs", kind: "LAB", labKind: "STUDIO" } },

  { week: 8,  moduleNumber: 4, label: "Module 4, MVP (week 2 of 2)",
    first:  { title: "Is it right, and who sees it", kind: "WORKSHOP" },
    second: { title: "Build Studio 2: a first version that opens", kind: "LAB", labKind: "STUDIO" },
    breakAfter: true },

  { week: 9,  moduleNumber: 5, label: "Module 5, Story (week 1 of 2)",
    first:  { title: "Who you are, for one room", kind: "WORKSHOP" },
    second: { title: "Say it out loud", kind: "LAB", labKind: "JUDGMENT" } },

  { week: 10, moduleNumber: 5, label: "Module 5, Story (week 2 of 2)",
    first:  { title: "Have something to say", kind: "WORKSHOP" },
    second: { title: "Finish the site", kind: "LAB", labKind: "STUDIO" } },

  { week: 11, moduleNumber: 6, label: "Module 6, Go to Market (week 1 of 2)",
    first:  { title: "Manage the pipeline", kind: "WORKSHOP" },
    second: { title: "Pipeline review, then sprint", kind: "LAB", labKind: "SPRINT" } },

  { week: 12, moduleNumber: 6, label: "Module 6, Go to Market and Personal Board (week 2 of 2)",
    first:  { title: "Close", kind: "WORKSHOP" },
    second: { title: "Practice the close, then make the asks", kind: "LAB", labKind: "SPRINT" } },

  { week: 13, moduleNumber: 7, label: "Module 7, Money",
    first:  { title: "Know your numbers", kind: "WORKSHOP" },
    second: { title: "Set your rule, then rehearse", kind: "LAB", labKind: "JUDGMENT" } },

  { week: 14, moduleNumber: 8, label: "Demo Day",
    first:  { title: "Demo Day, session 1", kind: "DEMO_DAY" },
    second: { title: "Demo Day, session 2, then the close", kind: "DEMO_DAY" } },
];

/**
 * The term shapes we can start a new class from, by key.
 *
 * ONBOARDING THE NEXT UNIVERSITY SHOULD NOT NEED A DEPLOY. There are two ways
 * to start a term and neither involves editing this file:
 *
 *   1. Pick a key from here. Today there is one, the Wake shape, because that is
 *      the programme. A genuinely different shape — a once-a-week class, a
 *      ten-week quarter — gets a key here, and that IS a code change, because a
 *      different shape is a different course.
 *   2. Copy a term that already exists. `templateFromSessions` reads the saved
 *      meetings of any university cohort back into a template, so "same class as
 *      Wake, starting the first week of September" is a duplicate with a new
 *      date, no code, no deploy. That is the path a second school takes.
 */
export const TERM_TEMPLATES: Record<string, { label: string; weeks: TermWeekTemplate[] }> = {
  "vantage-14-week": {
    label: "Vantage, 14 weeks, two meetings a week",
    weeks: WAKE_SPRING_2027,
  },
};

/**
 * Read a saved term back into a template.
 *
 * This is the duplicate path: a cohort's meetings already carry the whole shape
 * (which week, which module, workshop or lab, which kind of lab, the titles), so
 * a new class is that shape with a different first date. Nothing is copied that
 * belongs to the old class: no dates, no Zoom links, no rooms, no recordings.
 *
 * `week` is read, never guessed from the dates. A term whose meetings predate
 * that column falls back to pairing them in order, which is right for every
 * two-meeting week and is the only shape that existed before it.
 */
export function templateFromSessions(
  sessions: {
    sequence: number; week: number | null; kind: string; labKind: string | null;
    title: string; moduleId: string | null; startsAt: Date | null;
  }[],
  moduleNumberById: Map<string, number>,
): TermWeekTemplate[] {
  const ordered = [...sessions].sort((a, b) => a.sequence - b.sequence);
  if (ordered.length === 0) return [];

  const byWeek = new Map<number, typeof ordered>();
  ordered.forEach((s, i) => {
    const week = s.week ?? Math.floor(i / 2) + 1;
    byWeek.set(week, [...(byWeek.get(week) ?? []), s]);
  });

  const weeks = Array.from(byWeek.keys()).sort((a, b) => a - b);
  return weeks.map((week, idx) => {
    const meetings = byWeek.get(week)!;
    const first = meetings[0];
    const second = meetings[1] ?? meetings[0];
    const moduleNumber = first.moduleId ? moduleNumberById.get(first.moduleId) ?? null : null;

    /**
     * A break falls after this week when the next week's first meeting is more
     * than a week later. Derived from the source term's own dates, which is the
     * one thing about a break that is reliably recorded.
     */
    const nextWeek = weeks[idx + 1];
    const thisStart = first.startsAt?.getTime();
    const nextStart = nextWeek ? byWeek.get(nextWeek)![0].startsAt?.getTime() : undefined;
    const breakAfter = !!(thisStart && nextStart && nextStart - thisStart > 8 * 24 * 60 * 60 * 1000);

    return {
      week: idx + 1,
      moduleNumber,
      label: moduleNumber === null ? first.title : `Module ${moduleNumber}, week ${week}`,
      first:  { title: first.title,  kind: first.kind as SessionKind },
      second: { title: second.title, kind: second.kind as SessionKind,
                ...(second.labKind ? { labKind: second.labKind as LabKind } : {}) },
      ...(breakAfter ? { breakAfter: true } : {}),
    };
  });
}

export interface TermPlanInput {
  /** The first meeting of week 1, as a naive ET "YYYY-MM-DDTHH:MM". */
  firstMeeting: string;
  /**
   * Days from the first meeting of a week to the second. 2 for Tuesday and
   * Thursday, which is what Wake runs.
   */
  secondDayOffset?: number;
  /** Minutes per meeting. 75 is a class period. */
  minutes?: number;
  /**
   * When the pre-work for a meeting is due, as days from that meeting plus an ET
   * wall-clock time. A negative day count is before the meeting.
   *
   * The two days differ on purpose. A workshop's reading is due the night
   * before, like every other module. A lab's "ticket in" is Tuesday's work,
   * submitted before Thursday starts, so it is due the morning of the lab: the
   * facilitator needs the list of who has no ticket in time to book them into
   * office hours, and a student who finishes it Wednesday night is not late.
   */
  preworkOffset?: { days: number; time: string };
  labTicketOffset?: { days: number; time: string };
  /** Applied to every meeting unless edited afterwards. */
  zoomLink?: string | null;
  location?: string | null;
  /** Defaults to the Wake template. */
  template?: TermWeekTemplate[];
}

export interface PlannedSession {
  /** 1 to 28. What the attendance rule counts. */
  sequence: number;
  /** 1-based teaching week, stored on the row so a term can be copied. */
  week: number;
  weekLabel: string;
  moduleNumber: number | null;
  kind: SessionKind;
  labKind: LabKind | null;
  title: string;
  /** Naive ET strings, converted by the caller at the moment it writes. */
  startsAt: string;
  preworkDue: string;
  minutes: number;
  zoomLink: string | null;
  location: string | null;
}

/**
 * A module as this term runs it: when it opens, and when its one assignment is
 * due. Derived from the meetings rather than typed, because a module's weeks are
 * a fact about the term.
 *
 * Opens on the Monday of its first week, so the class can read ahead over the
 * weekend. The assignment is due the Friday night of its last week, which is the
 * rule the eight-module programme already uses and the one everybody states.
 * Weights come from the Grading tab and are confirmed by Dan, so they are set
 * here and not invented per cohort.
 */
export interface PlannedModule {
  moduleNumber: number;
  /** Naive ET. */
  opensAt: string;
  assignmentDue: string;
  weightPct: number | null;
  firstWeek: number;
  lastWeek: number;
}

/**
 * Proposed weights, from the Grading tab of the curriculum map (Nov 11, 2026).
 *
 * Dan has not confirmed them, so they are a proposal in one place rather than a
 * number typed into a form and forgotten. Attendance and touchpoints hold the
 * remaining 10% and are not a module, which is why these sum to 90.
 */
export const WAKE_WEIGHTS: Record<number, number> = {
  1: 10, // Self Statement
  2: 15, // Industry Brief and Discovery Log
  3: 10, // My Wedge and ten firms
  4: 15, // Spec and a build that runs
  5: 15, // The site with five things
  6: 10, // Pipeline and project pitch
  7: 5,  // Money Plan
  8: 10, // Demo Day presentation and 90-day plan
};

/** The modules of a planned term, with their dates and weights. Pure. */
export function planModules(
  plan: PlannedSession[],
  weights: Record<number, number> = WAKE_WEIGHTS,
): PlannedModule[] {
  const byModule = new Map<number, PlannedSession[]>();
  for (const s of plan) {
    if (s.moduleNumber === null) continue;
    const list = byModule.get(s.moduleNumber) ?? [];
    list.push(s);
    byModule.set(s.moduleNumber, list);
  }

  return Array.from(byModule.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([moduleNumber, sessions]) => {
      const sorted = [...sessions].sort((a, b) => a.sequence - b.sequence);
      const first = sorted[0];
      const last  = sorted[sorted.length - 1];
      const firstDate = first.startsAt.split("T")[0];
      const lastDate  = last.startsAt.split("T")[0];
      return {
        moduleNumber,
        // The Monday of the first week. A Tuesday first meeting is one day on.
        opensAt:       `${shiftDays(firstDate, -mondayOffset(firstDate))}T09:00`,
        // The Friday of the last week, last thing.
        assignmentDue: `${shiftDays(lastDate, fridayOffset(lastDate))}T23:59`,
        weightPct:     weights[moduleNumber] ?? null,
        firstWeek:     first.week,
        lastWeek:      last.week,
      };
    });
}

/** Days back to the Monday of this date's week. */
function mondayOffset(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun … 6 Sat
  return dow === 0 ? 6 : dow - 1;
}

/** Days forward to the Friday of this date's week. */
function fridayOffset(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  // Sunday counts as the end of that week, not the start of the next one.
  return dow === 0 ? -2 : 5 - dow;
}

const DEFAULTS = {
  secondDayOffset: 2,
  minutes: 75,
  preworkOffset:   { days: -1, time: "23:59" },
  labTicketOffset: { days:  0, time: "09:00" },
};

/** Shift a naive ET date by whole days, keeping it naive. */
function shiftDays(naiveDate: string, days: number): string {
  const [y, m, d] = naiveDate.split("-").map(Number);
  // UTC purely as date arithmetic. No timezone meaning is attached until
  // fromEasternNaive is applied to the final "date + time" string.
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** The term, as naive ET strings. Pure. */
export function planTerm(input: TermPlanInput): PlannedSession[] {
  const template = input.template ?? WAKE_SPRING_2027;
  const [firstDate, firstTime] = input.firstMeeting.split("T");
  if (!firstDate || !firstTime) throw new Error("firstMeeting must be YYYY-MM-DDTHH:MM");

  const secondDayOffset = input.secondDayOffset ?? DEFAULTS.secondDayOffset;
  const minutes         = input.minutes ?? DEFAULTS.minutes;
  const prework         = input.preworkOffset ?? DEFAULTS.preworkOffset;
  const ticket          = input.labTicketOffset ?? DEFAULTS.labTicketOffset;
  const zoomLink        = input.zoomLink?.trim() || null;
  const location        = input.location?.trim() || null;

  const out: PlannedSession[] = [];
  let weekStart = firstDate;
  let sequence = 1;

  for (const w of template) {
    const days: { date: string; meeting: TermWeekTemplate["second"] }[] = [
      { date: weekStart, meeting: w.first as TermWeekTemplate["second"] },
      { date: shiftDays(weekStart, secondDayOffset), meeting: w.second },
    ];

    for (const { date, meeting } of days) {
      const isLab = meeting.kind === "LAB";
      const due = isLab ? ticket : prework;
      out.push({
        sequence:     sequence++,
        week:         w.week,
        weekLabel:    w.label,
        moduleNumber: w.moduleNumber,
        kind:         meeting.kind,
        labKind:      meeting.labKind ?? null,
        title:        meeting.title,
        startsAt:     `${date}T${firstTime}`,
        preworkDue:   `${shiftDays(date, due.days)}T${due.time}`,
        minutes,
        zoomLink,
        location,
      });
    }

    // A break week is a week with no meetings, so the next teaching week is two
    // weeks on rather than one.
    weekStart = shiftDays(weekStart, w.breakAfter ? 14 : 7);
  }

  return out;
}

/**
 * Problems worth refusing to save, in the admin's words.
 *
 * Checked on the plan rather than on the form, so a hand-edited row is held to
 * the same rules as a generated one.
 */
export function validateTerm(plan: PlannedSession[]): string[] {
  const errors: string[] = [];
  const t = (s: string) => fromEasternNaive(s).getTime();

  for (const s of plan) {
    if (t(s.preworkDue) > t(s.startsAt)) {
      errors.push(`Session ${s.sequence} (${s.title}): the pre-work is due after the meeting it prepares for.`);
    }
    if (s.kind === "LAB" && !s.labKind) {
      errors.push(`Session ${s.sequence} (${s.title}): a lab has to say which kind it is, sprint, studio or judgment.`);
    }
    if (s.kind !== "LAB" && s.labKind) {
      errors.push(`Session ${s.sequence} (${s.title}): only a lab can have a lab kind.`);
    }
  }

  for (let i = 1; i < plan.length; i++) {
    if (t(plan[i].startsAt) <= t(plan[i - 1].startsAt)) {
      errors.push(`Session ${plan[i].sequence} (${plan[i].title}) is not after the session before it.`);
    }
  }

  const seqs = new Set(plan.map(s => s.sequence));
  if (seqs.size !== plan.length) errors.push("Two sessions have the same place in the term.");

  // A weekday check, because the whole point of a university term is that it
  // meets on the days the catalog says. A plan that drifts onto a Wednesday is a
  // typed start date, not an intention.
  const weekdays = new Set(
    plan.map(s => {
      const [y, m, d] = s.startsAt.split("T")[0].split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    }),
  );
  if (weekdays.size > 2) {
    errors.push("These sessions land on more than two weekdays. Check the start date and the second-day offset.");
  }

  return errors;
}
