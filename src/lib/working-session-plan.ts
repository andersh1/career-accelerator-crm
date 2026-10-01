/**
 * Working sessions, generated from the cohort's own schedule.
 *
 * ── The cadence, read off what was already built by hand ──
 *
 * One session the day after each of Modules 4 to 8 OPENS. Every session in both
 * running cohorts sits at exactly +1 day, whatever weekday that is:
 *
 *   Fellowship 2   M4 opens Wed Sep 23  ->  session Thu Sep 24
 *   Private: Nick  M4 opens Tue Oct 27  ->  session Wed Oct 28
 *
 * Anchoring on the OPEN date rather than the live session is not a detail. The
 * session lands before that module's own live call, so matching on nearest
 * session date assigns it to the module before — which is how M4's Build
 * Session reads as Module 3 work if you let a date rule decide.
 *
 * Modules 1 to 3 get none, which is how both cohorts already run.
 *
 * ── One slot ──
 *
 * Fellowship 2 runs each session twice, at 1pm and 7pm ET, because that cohort
 * has Fellows overseas. Caleb has said that was particular to them, so the
 * generator makes one. Their existing pairs are left alone.
 *
 * ── Optional ──
 *
 * All of them. Dropping in is a choice, and a Fellow should be told that rather
 * than left to infer it from a title.
 */

export type Track = "COHORT" | "PRIVATE";

export interface PlannedSession {
  moduleNumber: number;
  title: string;
  kind: "BUILD" | "OFFICE_HOURS" | "CLINIC";
  /** Eastern wall-clock, as the admin typed it. */
  startsAt: Date;
  durationMins: number;
  summary: string;
}

interface Template {
  moduleNumber: number;
  kind: PlannedSession["kind"];
  /** Topic, without the type prefix or the time suffix. */
  topic: string;
  summary: string;
}

/**
 * The five, per track.
 *
 * They differ only at the end. A group cohort finishes with Demo Day, so its
 * last session is the one that gets the deck ready and the clinic sits at M7.
 * A private client has no Demo Day, so the clinic moves to the end and M7
 * becomes the Money OS working session instead.
 */
const TEMPLATES: Record<Track, Template[]> = {
  COHORT: [
    { moduleNumber: 4, kind: "BUILD",        topic: "Claude Build Session — ship your personal site",
      summary: "Your site goes live, and the Module 4 MVP drops into it as the featured project." },
    { moduleNumber: 5, kind: "OFFICE_HOURS", topic: "Build + Office Hours — MVP v1 week",
      summary: "Bring the build. We unstick whatever is in the way before Friday." },
    { moduleNumber: 6, kind: "OFFICE_HOURS", topic: "Office Hours — make every channel say the same sentence",
      summary: "Your positioning, said the same way everywhere it appears." },
    { moduleNumber: 7, kind: "CLINIC",       topic: "Finish Clinic — Money OS and your pipeline",
      summary: "Get the model and the pipeline through the gate. Reasoning and percentages, not dollars." },
    { moduleNumber: 8, kind: "OFFICE_HOURS", topic: "Office Hours — Money OS v1 and your Demo Day deck",
      summary: "Last pass on the numbers and the deck before Demo Day." },
  ],
  PRIVATE: [
    { moduleNumber: 4, kind: "BUILD",        topic: "Claude Build Session — ship your personal site",
      summary: "Your site goes live, and the Module 4 MVP drops into it as the featured project." },
    { moduleNumber: 5, kind: "OFFICE_HOURS", topic: "Build + Office Hours — MVP v1 week",
      summary: "Bring the build. We unstick whatever is in the way before Friday." },
    { moduleNumber: 6, kind: "OFFICE_HOURS", topic: "Office Hours — make every channel say the same sentence",
      summary: "Your positioning, said the same way everywhere it appears." },
    { moduleNumber: 7, kind: "OFFICE_HOURS", topic: "Office Hours — Money OS and your pipeline",
      summary: "Work the model and the pipeline together while Module 7 is open." },
    { moduleNumber: 8, kind: "CLINIC",       topic: "Finish Clinic — Money OS",
      summary: "Get the model through the gate. Reasoning and percentages, not dollars." },
  ],
};

/** Days after a module opens that its working session runs. */
export const DEFAULT_OFFSET_DAYS = 1;

export interface PlanInput {
  track: string;
  /** The cohort's schedule: when each module opens. */
  schedules: { moduleNumber: number; startDate: Date | null }[];
  /** Eastern wall-clock time of day, "13:00". */
  timeOfDay: string;
  durationMins: number;
  offsetDays?: number;
}

export interface PlanResult {
  sessions: PlannedSession[];
  /** Modules in the template with no opening date, so nothing could be planned. */
  skipped: number[];
}

/** Title as it appears to a Fellow, with the time on the end, as built by hand. */
export function sessionTitle(topic: string, timeOfDay: string): string {
  return `${topic} (${prettyTime(timeOfDay)} ET)`;
}

function prettyTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** The Eastern calendar date `days` after `from`, as "YYYY-MM-DD". */
export function addDaysEastern(from: Date, days: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(from);
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  // Midday UTC so adding days can never cross a boundary by accident.
  const d = new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 12));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function planWorkingSessions(input: PlanInput): PlanResult {
  const track: Track = input.track === "PRIVATE" ? "PRIVATE" : "COHORT";
  const offset = input.offsetDays ?? DEFAULT_OFFSET_DAYS;
  const [hh, mm] = input.timeOfDay.split(":").map(Number);

  const byModule = new Map(input.schedules.map(s => [s.moduleNumber, s.startDate]));
  const sessions: PlannedSession[] = [];
  const skipped: number[] = [];

  for (const t of TEMPLATES[track]) {
    const opens = byModule.get(t.moduleNumber);
    if (!opens) { skipped.push(t.moduleNumber); continue; }

    // The calendar day has to be read in EASTERN, not in the server's zone.
    // These are timestamptz: a module opening at 9pm ET is already the next day
    // in UTC, so local getters would put the session a day late. That is a
    // one-day error on a date a Fellow reads, which is the whole class of bug
    // this generator exists to stop.
    const naive = `${addDaysEastern(opens, offset)}T${String(hh).padStart(2, "0")}:${String(mm ?? 0).padStart(2, "0")}`;

    sessions.push({
      moduleNumber: t.moduleNumber,
      title: sessionTitle(t.topic, input.timeOfDay),
      kind: t.kind,
      startsAt: new Date(naive),
      durationMins: input.durationMins,
      summary: t.summary,
    });
  }

  return { sessions, skipped };
}
