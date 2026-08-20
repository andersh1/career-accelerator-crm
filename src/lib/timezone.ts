// Admin schedule inputs are entered as Eastern Time wall-clock values.
// These helpers convert between naive "YYYY-MM-DDTHH:MM" strings (ET) and real UTC instants.

const ET = "America/New_York";

/** Interpret a naive datetime-local string as Eastern Time → UTC Date. DST-aware.
 *  Strings that already carry a zone (Z or ±HH:MM) are parsed as-is. */
export function fromEasternNaive(naive: string): Date {
  if (naive.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(naive)) return new Date(naive);
  // First guess: treat the wall time as if it were UTC
  const guess = new Date(`${naive}:00Z`);
  // What wall time does that instant show in ET?
  const shown = new Date(guess.toLocaleString("en-US", { timeZone: ET }));
  const target = new Date(`${naive}:00`);
  // Shift by the difference so the ET wall time matches what was typed
  return new Date(guess.getTime() + (target.getTime() - shown.getTime()));
}

/** Format a stored UTC instant as an ET wall-clock "YYYY-MM-DDTHH:MM" string for datetime-local inputs. */
export function toEasternInput(iso: string | Date | null): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}
