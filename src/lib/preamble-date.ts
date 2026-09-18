/**
 * When a module's kick-off email should go out.
 *
 * Derived from the cohort's own schedule so it scales to more than one cohort
 * running on different dates — setting eight dates by hand per cohort is how
 * Module 3's ended up unset and the email waited for someone to notice.
 *
 * Anchored to PRE-WORK, not the module start. That distinction matters because
 * of the break: Module 6 opens two weeks before its pre-work is due, so
 * "start + 2 days" would mail a kick-off eleven days before anyone could act
 * on it. Two days before pre-work is due puts it the Friday before a Sunday
 * deadline — which is what Modules 1, 2 and 3 all did in practice.
 *
 * 8am Eastern: early enough to be the first thing read on the Friday, and an
 * hour clear of the 9am cron so a same-minute comparison never decides whether
 * it is due.
 */
const SEND_HOUR_ET = 8;

/** The Eastern calendar date of an instant, as {y, m, d}. */
function easternParts(d: Date): { y: number; m: number; day: number } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  const [y, m, day] = f.split("-").map(Number);
  return { y, m, day };
}

/** Eastern's UTC offset on a given date — -4 in daylight time, -5 in standard. */
function easternOffsetHours(d: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", timeZoneName: "short",
  }).format(d);
  return name.includes("EDT") ? 4 : 5;
}

/**
 * Two days before pre-work is due, at 8am Eastern.
 *
 * Returns null when there is no pre-work deadline to anchor to — a guess is
 * worse than leaving it unset, because an unset date simply waits whereas a
 * wrong one mails eleven people on the wrong day.
 */
export function defaultPreambleDate(preworkDue: Date | null | undefined): Date | null {
  if (!preworkDue) return null;

  const { y, m, day } = easternParts(preworkDue);
  // Build the target Eastern calendar day, two days earlier. Using UTC
  // arithmetic on the date parts avoids the local timezone of whatever machine
  // this runs on leaking into the answer.
  const target = new Date(Date.UTC(y, m - 1, day - 2, 12, 0, 0));
  const t = easternParts(target);

  // Resolve 8am on that Eastern day to an instant, using that day's own offset
  // so a date either side of a DST change still lands at 8am local.
  const offset = easternOffsetHours(target);
  return new Date(Date.UTC(t.y, t.m - 1, t.day, SEND_HOUR_ET + offset, 0, 0));
}
