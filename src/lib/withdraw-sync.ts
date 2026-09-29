/**
 * Make "Withdrawn" in the CRM mean withdrawn.
 *
 * Moving a lead to WITHDRAWN used to change a label and nothing else. The
 * Fellow kept LMS access and kept receiving every automated email, because
 * User.withdrawnAt is what all of that keys on and only the LMS ever wrote it.
 * Two screens disagreed, and the one an admin actually uses was the one that
 * was wrong.
 *
 * Rather than duplicate the withdrawal logic here, this calls the LMS route
 * that already owns it. That route takes a completion snapshot BEFORE revoking
 * anything and writes it to this lead, so the record of what someone finished
 * survives them losing access, and a refund conversation has something to stand
 * on. Reimplementing that in a second place is how the two versions drift.
 *
 * Deliberately best-effort: a lead's stage should still move even if the LMS is
 * unreachable. The caller reports what happened rather than failing the edit,
 * because an admin who thinks the save failed will press it again.
 */

const LMS_URL = process.env.LMS_URL ?? "https://lms.vantagecareer.co";

export type WithdrawSyncResult =
  | { ok: true; action: "withdrawn" | "reinstated" | "already" }
  | { ok: false; reason: string };

async function call(userId: string, method: "POST" | "DELETE", reason?: string): Promise<WithdrawSyncResult> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return { ok: false, reason: "INTERNAL_API_SECRET is not set in this app, so the LMS cannot be told." };

  try {
    const res = await fetch(
      `${LMS_URL}/api/admin/students/${userId}/withdraw?key=${encodeURIComponent(secret)}`,
      {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify({ reason }) : undefined,
        cache: "no-store",
      },
    );
    // Already in the target state is success, not failure: the point is that
    // the two systems agree, and they do.
    if (res.status === 409) return { ok: true, action: "already" };
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, reason: (body as { error?: string }).error ?? `LMS returned ${res.status}` };
    }
    return { ok: true, action: method === "POST" ? "withdrawn" : "reinstated" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Could not reach the LMS" };
  }
}

/** Revoke LMS access and stop every automated email. */
export function withdrawInLms(userId: string, reason?: string) {
  return call(userId, "POST", reason);
}

/** Give access back. Moving a lead off Withdrawn should undo it, or the two
 *  systems disagree again in the other direction. */
export function reinstateInLms(userId: string) {
  return call(userId, "DELETE");
}
