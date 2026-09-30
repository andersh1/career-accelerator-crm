/**
 * Post a module's slide deck and session recording into the LMS, for one cohort.
 *
 * A cohort is built here and delivered there, so the deck and recording belong
 * on the same page as the dates and the Zoom links rather than in a second app.
 *
 * ── Why this calls the LMS instead of writing the rows itself ──
 *
 * Both apps share one database, so this could write the Resource rows directly.
 * It deliberately does not. Posting a recording is not one insert: it finds or
 * creates the module's RECORDING section, rewrites Google share links to the
 * /preview form that will actually embed, and keeps exactly one deck and one
 * recording per module PER COHORT. Two copies of those rules is how the two
 * drift, and the failure that drift produces is a Fellow seeing two "Session
 * Recording" links, or one cohort's recording replacing another's. That second
 * one is the bug this whole feature exists to fix, so it is not worth risking
 * to save a network hop.
 *
 * Reading them back is a plain two-field lookup with no invariants to break, so
 * the schedule route reads the database directly. Writes go through here.
 *
 * Not best-effort, unlike withdraw-sync: if this fails, nothing happened, and
 * the caller must say so. An admin who is told a recording saved and finds it
 * missing a week later has no reason to trust the page again.
 */

const LMS_URL = process.env.LMS_URL ?? "https://lms.vantagecareer.co";

export type RecordingSyncResult =
  | { ok: true; deckUrl: string | null; recordingUrl: string | null }
  | { ok: false; reason: string };

export async function postRecordingToLms(opts: {
  cohortId: string;
  moduleId: string;
  /** Omit a field to leave it untouched; pass null or "" to clear it. */
  deckUrl?: string | null;
  recordingUrl?: string | null;
}): Promise<RecordingSyncResult> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return { ok: false, reason: "INTERNAL_API_SECRET is not set in this app, so the LMS cannot be updated." };
  }

  // Only send the fields the caller actually set. The LMS route keys off which
  // keys are present, so sending both when only one changed would clear the other.
  const body: Record<string, unknown> = { cohortId: opts.cohortId, moduleId: opts.moduleId };
  if ("deckUrl" in opts)      body.deckUrl      = opts.deckUrl      || null;
  if ("recordingUrl" in opts) body.recordingUrl = opts.recordingUrl || null;

  try {
    const res = await fetch(`${LMS_URL}/api/admin/recording?key=${encodeURIComponent(secret)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, reason: (err as { error?: string }).error ?? `LMS returned ${res.status}` };
    }
    const out = await res.json() as { deckUrl: string | null; recordingUrl: string | null };
    return { ok: true, deckUrl: out.deckUrl ?? null, recordingUrl: out.recordingUrl ?? null };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Could not reach the LMS" };
  }
}
