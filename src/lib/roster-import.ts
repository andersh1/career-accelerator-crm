/**
 * Read a pasted class list.
 *
 * A Fellow arrives through the pipeline. A university student arrives on a list
 * from the registrar, in whatever shape that office sends: name then email or
 * email then name, commas or tabs, with or without a header row. Parsing it
 * loosely is the difference between a paste and an afternoon of reformatting,
 * and this is a pure function so it can be checked against real pastes without
 * a request or a database.
 *
 * It guesses nothing it cannot see: the email is whichever field looks like one,
 * so a line with no email is reported rather than turned into an account nobody
 * can sign in to.
 *
 * Lives here rather than in the route because a Next route file may only export
 * HTTP handlers.
 */

/** Deliberately permissive: this rejects typos, not unusual addresses. */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export interface ParsedRosterRow { name: string; email: string; line: number; raw: string }
export interface SkippedRosterLine { line: number; raw: string; why: string }

export function parseRoster(text: string): { rows: ParsedRosterRow[]; skipped: SkippedRosterLine[] } {
  const rows: ParsedRosterRow[] = [];
  const skipped: SkippedRosterLine[] = [];

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;

    const parts = trimmed.split(/[\t,;]+/).map(p => p.trim()).filter(Boolean);
    const email = parts.find(p => EMAIL_SHAPE.test(p));
    if (!email) {
      // A header row is not a problem worth reporting as one.
      const looksLikeHeader = /name|email|student|first|last/i.test(trimmed) && parts.length <= 4;
      if (!looksLikeHeader) skipped.push({ line, raw: trimmed, why: "no email address on this line" });
      return;
    }
    const name = parts.filter(p => p !== email).join(" ").replace(/\s+/g, " ").trim();
    if (!name) {
      skipped.push({ line, raw: trimmed, why: "an email but no name" });
      return;
    }
    rows.push({ name, email: email.toLowerCase(), line, raw: trimmed });
  });

  return { rows, skipped };
}
