/**
 * Build a whole cohort's schedule from a handful of inputs.
 *
 * Setting up a cohort by hand is eight modules times five dates — forty values
 * typed one at a time, in two different apps, where one wrong date silently
 * unlocks a module early or mails a kick-off about a deadline that has passed.
 * In practice every cohort has the same shape: a weekly session, content
 * opening a few days before, pre-work due the night before that, the kick-off
 * email in between, and the assignment due at the end of the session week.
 *
 * So the shape is the input: first session, cadence, and four offsets measured
 * in days from that module's session. Everything else falls out.
 *
 * Offsets are in whole days and a wall-clock time, both interpreted in Eastern,
 * because that is how the rest of the scheduling works and how Dan thinks about
 * it. A negative offset is before the session.
 *
 * Break weeks are explicit rather than inferred: every cohort so far has had
 * one somewhere (Fellowship 2 took the week of Columbus Day; a Monday cohort
 * running into late November has to step over Thanksgiving), and guessing which
 * week to skip from a holiday calendar would be worse than being told.
 */
import { fromEasternNaive } from "@/lib/timezone";

export interface ScheduleOffsets {
  /** Days from the session, and the ET wall-clock time. Negative is before. */
  unlock:     { days: number; time: string };
  prework:    { days: number; time: string };
  preamble:   { days: number; time: string };
  assignment: { days: number; time: string };
}

export interface SchedulePlanInput {
  /** First module's session, as a naive ET "YYYY-MM-DDTHH:MM". */
  firstSession: string;
  /** Weeks between sessions. 1 for weekly, 2 for a fortnightly cohort. */
  cadenceWeeks: number;
  /** Module numbers after which to insert one extra week (a break). */
  breakAfter?: number[];
  offsets: ScheduleOffsets;
  /** Applied to every module unless overridden later. */
  sessionZoomLink?: string | null;
  sessionLocation?: string | null;
  /** How many modules to plan. Defaults to 8. */
  moduleCount?: number;
}

export interface PlannedModule {
  moduleNumber: number;
  /** Naive ET strings, ready to hand back to the PATCH endpoint. */
  startDate: string;
  preworkDue: string;
  preambleDate: string;
  sessionDate: string;
  assignmentDue: string;
  sessionZoomLink: string | null;
  sessionLocation: string | null;
}

/** Fellowship 2's shape, which is the house default: a Tuesday evening session,
 *  content opening the Wednesday before, pre-work Sunday night, kick-off Friday
 *  morning, assignment due the Friday after. */
export const DEFAULT_OFFSETS: ScheduleOffsets = {
  unlock:     { days: -6, time: "09:00" },
  prework:    { days: -2, time: "23:59" },
  preamble:   { days: -4, time: "08:00" },
  assignment: { days: +3, time: "23:59" },
};

/** Shift a naive ET date string by whole days, keeping it naive. */
function shiftDays(naiveDate: string, days: number): string {
  const [y, m, d] = naiveDate.split("-").map(Number);
  // Built in UTC purely as date arithmetic — no timezone meaning is attached
  // until fromEasternNaive is applied to the final "date + time" string.
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function at(naiveDate: string, days: number, time: string): string {
  return `${shiftDays(naiveDate, days)}T${time}`;
}

/**
 * The offset that puts the assignment on the Friday of the session's week.
 *
 * "Due Friday" is the rule everyone states; the number of days that takes
 * depends on which weekday the session falls on, so it is derived rather than
 * typed. A Friday or weekend session keeps the following Friday.
 */
export function assignmentOffsetForFriday(firstSessionDate: string): number {
  const [y, m, d] = firstSessionDate.split("T")[0].split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun … 6 Sat
  const delta = 5 - dow;                                   // 5 = Friday
  return delta > 0 ? delta : delta + 7;
}

/** The plan, as naive ET strings. Pure — writes nothing. */
export function planSchedule(input: SchedulePlanInput): PlannedModule[] {
  const count = input.moduleCount ?? 8;
  const breaks = new Set(input.breakAfter ?? []);
  const [firstDate, firstTime] = input.firstSession.split("T");
  if (!firstDate || !firstTime) throw new Error("firstSession must be YYYY-MM-DDTHH:MM");

  const out: PlannedModule[] = [];
  let sessionDate = firstDate;

  for (let n = 1; n <= count; n++) {
    out.push({
      moduleNumber:    n,
      sessionDate:     `${sessionDate}T${firstTime}`,
      startDate:       at(sessionDate, input.offsets.unlock.days,     input.offsets.unlock.time),
      preworkDue:      at(sessionDate, input.offsets.prework.days,    input.offsets.prework.time),
      preambleDate:    at(sessionDate, input.offsets.preamble.days,   input.offsets.preamble.time),
      assignmentDue:   at(sessionDate, input.offsets.assignment.days, input.offsets.assignment.time),
      sessionZoomLink: input.sessionZoomLink?.trim() || null,
      sessionLocation: input.sessionLocation?.trim() || null,
    });
    const weeks = input.cadenceWeeks + (breaks.has(n) ? 1 : 0);
    sessionDate = shiftDays(sessionDate, weeks * 7);
  }
  return out;
}

/**
 * Problems worth refusing to save, in the admin's words.
 *
 * Checked on the plan rather than on the form, so a hand-edited row is held to
 * the same rules as a generated one.
 */
export function validatePlan(plan: PlannedModule[]): string[] {
  const errors: string[] = [];
  const t = (s: string) => fromEasternNaive(s).getTime();
  for (const m of plan) {
    if (t(m.startDate) > t(m.sessionDate)) {
      errors.push(`Module ${m.moduleNumber}: the module opens after its own session.`);
    }
    if (t(m.preworkDue) > t(m.sessionDate)) {
      errors.push(`Module ${m.moduleNumber}: pre-work is due after the session it prepares for.`);
    }
    if (t(m.preambleDate) > t(m.preworkDue)) {
      errors.push(`Module ${m.moduleNumber}: the kick-off email goes out after the pre-work is already due.`);
    }
    if (t(m.assignmentDue) < t(m.sessionDate)) {
      errors.push(`Module ${m.moduleNumber}: the assignment is due before the session.`);
    }
  }
  for (let i = 1; i < plan.length; i++) {
    if (t(plan[i].startDate) < t(plan[i - 1].sessionDate)) {
      errors.push(`Module ${plan[i].moduleNumber} opens before Module ${plan[i - 1].moduleNumber}'s session — they would overlap.`);
    }
  }
  return errors;
}
