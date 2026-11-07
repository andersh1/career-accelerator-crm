/**
 * Mirror a new Fellow into the Networking CRM sign-in allowlist.
 *
 * The Networking CRM (networking.vantagecareer.co) is a separate Supabase app
 * with its own `allowed_emails` gate. A Fellow cannot sign in until their email
 * is on that list: the CRM's handle_new_user trigger rejects any address that
 * isn't.
 *
 * This file is a copy of the LMS's `src/lib/networking-enroll.ts`, and it is
 * deliberate rather than drift. The LMS mirrors every Fellow from a Prisma
 * middleware on its own client, with a comment saying no account-creation path
 * can forget it. But this app is a separate deployment with its own Prisma
 * client against the same database, so "every path" only ever meant every path
 * in the LMS. Converting a lead here creates the User row through the client in
 * ./prisma, which the LMS middleware never sees, so the only account-creation
 * path a coach actually uses was the one path that skipped the mirror.
 *
 * The two apps share a database but not a package, same as src/components/ui/
 * Field.tsx. If this behaviour changes, change it in both.
 *
 * Server-only. Best-effort and non-fatal: a failure here must never block
 * account creation. It no-ops when the env vars aren't set, so this is safe to
 * ship before the networking keys are configured.
 *
 * Setup (one time, in the CRM Vercel project env — server-side, not NEXT_PUBLIC):
 *   NETWORKING_SUPABASE_URL          = https://zkxtbktborngftmrcmbp.supabase.co
 *   NETWORKING_SUPABASE_SERVICE_KEY  = <the networking project's service_role key>
 * The service_role key bypasses RLS, so it stays server-side only.
 */

const URL_ = process.env.NETWORKING_SUPABASE_URL ?? "";
const KEY_ = process.env.NETWORKING_SUPABASE_SERVICE_KEY ?? "";

export const networkingEnrollConfigured = () => URL_.length > 0 && KEY_.length > 0;

/**
 * Map an LMS role onto a Networking CRM allowlist role. Only real Fellows and
 * admins belong on it. CRM_PARTICIPANT (support-ticket shells that never log
 * into the LMS) and anything else return null and are skipped.
 */
function crmRole(lmsRole: string | undefined | null): "participant" | "admin" | null {
  // The User.role column defaults to STUDENT, so a create that omits it is a
  // student.
  const r = lmsRole ?? "STUDENT";
  if (r === "STUDENT") return "participant";
  if (r === "ADMIN") return "admin";
  return null;
}

export async function syncNetworkingAllowlist(input: {
  email: string | undefined | null;
  name?: string | null;
  role?: string | null;
}): Promise<void> {
  const role = crmRole(input.role);
  if (!role) return; // not a Fellow or admin — nothing to mirror
  if (!networkingEnrollConfigured()) return;

  const email = (input.email ?? "").trim().toLowerCase();
  if (!email) return;

  try {
    // PostgREST upsert on the primary key (email). The networking CRM's
    // allowed_emails table keys on email, so merge-duplicates makes this
    // idempotent: a repeat enrollment just refreshes the name/role.
    const res = await fetch(`${URL_.replace(/\/$/, "")}/rest/v1/allowed_emails`, {
      method: "POST",
      headers: {
        apikey: KEY_,
        Authorization: `Bearer ${KEY_}`,
        "content-type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ email, full_name: (input.name ?? "").trim() || email, role }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(
        "networking allowlist sync failed",
        res.status,
        await res.text().catch(() => ""),
      );
    }
  } catch (e) {
    console.error("networking allowlist sync error", e);
  }
}
