/**
 * What happens when someone already in the CRM submits a form again.
 *
 * Both public intake routes used to handle this the same broken way: log a
 * one-line "Re-submitted" note, return success, and discard everything the
 * person had typed. Nick Goldstein's application on Sept 16 vanished like this
 * — he was told it went through, his answers were never stored, and nobody was
 * alerted.
 *
 * It lived in TWO routes as two separate copies, which is how the first fix
 * (to /api/public/intake) left the second (/api/intake, behind the CRM's own
 * /apply page) still broken. One implementation now, used by both.
 *
 * The guarantees:
 *  - nothing a person submitted is discarded — it is written in full to the
 *    lead's timeline
 *  - fields are only FILLED, never overwritten; what we already knew stands
 *  - any change to type, stage, priority or owner is the caller's decision,
 *    passed in explicitly, never inferred here
 */
import { prisma } from "@/lib/prisma";

export async function mergeIntoExistingLead(opts: {
  leadId: string;
  /** Current values, so only empty ones are filled. */
  current: Record<string, string | null | undefined>;
  /** Submitted values for those same columns. */
  submitted: Record<string, string | null | undefined>;
  /** Explicit changes the caller has decided on — type, stage, priority, owner. */
  changes?: Record<string, unknown>;
  /** First line of the timeline note, e.g. "📝 Submitted an application". */
  headline: string;
  /** Extra lines — what moved, and why. Nulls are dropped. */
  details?: (string | null)[];
  /** The free text they wrote. Stored in full. */
  body?: string | null;
}): Promise<void> {
  const fill: Record<string, string> = {};
  for (const [key, next] of Object.entries(opts.submitted)) {
    const cur = opts.current[key];
    const val = typeof next === "string" ? next.trim() : "";
    if (!cur && val) fill[key] = val;
  }

  if (Object.keys(fill).length || (opts.changes && Object.keys(opts.changes).length)) {
    await prisma.lead.update({
      where: { id: opts.leadId },
      data: { ...fill, ...(opts.changes ?? {}) },
    });
  }

  await prisma.leadActivity.create({
    data: {
      leadId: opts.leadId,
      type: "NOTE",
      content: [
        opts.headline,
        ...(opts.details ?? []),
        opts.body?.trim() ? `\n${opts.body.trim()}` : null,
      ].filter(Boolean).join("\n"),
    },
  });
}
