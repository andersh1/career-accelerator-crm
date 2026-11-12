/**
 * GET /api/auth/gmail?code=...  — OAuth callback from Google
 * GET /api/auth/gmail?action=url — returns the OAuth consent URL to redirect to
 * GET /api/auth/gmail?action=disconnect — disconnects Gmail for this admin
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { promotePrimary } from "@/lib/gmail-sync";

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const BASE_URL      = process.env.NEXTAUTH_URL ?? "https://career-accelerator-crm.vercel.app";
const REDIRECT_URI  = `${BASE_URL}/api/auth/gmail`;

/**
 * calendar.events was added so the CRM can create cohort session events on a
 * Vantage calendar and let Google send the invitations.
 *
 * Adding a scope does not upgrade a token that already exists: the three
 * admins connected before this line was written hold Gmail-only refresh
 * tokens, and those will refresh perfectly and then be refused by the Calendar
 * API. Reconnecting in Settings is what grants it. `prompt: "consent"` below
 * was already forcing a fresh refresh_token on every pass, so one reconnect is
 * the whole upgrade path.
 *
 * Scoped to events rather than the full calendar scope: this needs to create
 * and move events, never to create, share or delete a calendar.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

function oauthUrl(state: string) {
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: "code",
    scope:         SCOPES,
    access_type:   "offline",
    prompt:        "consent",   // force refresh_token every time
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/login", BASE_URL));
  }
  const sessionUser = (session as { user: { id: string; email?: string } }).user;
  const userId    = sessionUser.id;
  const userEmail = sessionUser.email ?? "";

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const code   = searchParams.get("code");

  // ── Return connection status ──────────────────────────────────────────────
  if (action === "status") {
    const user = await prisma.user.findFirst({
      where:  { OR: [{ id: userId }, { email: userEmail }] },
      select: {
        id: true, gmailEmail: true, gmailSyncedAt: true,
        gmailRefreshToken: true, gmailSyncError: true,
        gmailAccounts: {
          select: { id: true, email: true, syncedAt: true, syncError: true, isPrimary: true },
          orderBy: [{ isPrimary: "desc" }, { email: "asc" }],
        },
      },
    });

    /**
     * `healthy` is the honest answer, and it is not the same as `connected`.
     *
     * A stored refresh token only says somebody once completed the OAuth
     * flow. Google can revoke it at any time, and when it does the sync stops
     * without telling anyone — which is exactly what happened to all three
     * admins in September 2026 while Settings showed a green badge.
     *
     * The sync runs daily, so two days without one is a connection that has
     * stopped working even when no error was recorded.
     */
    const syncedAt = user?.gmailSyncedAt ?? null;
    const staleAfterMs = 2 * 24 * 60 * 60 * 1000;
    const stale = !!user?.gmailRefreshToken && syncedAt !== null
      && Date.now() - syncedAt.getTime() > staleAfterMs;

    /** The same health rule, per mailbox. */
    const describe = (a: { id: string; email: string; syncedAt: Date | null; syncError: string | null; isPrimary: boolean }) => {
      const isStale = a.syncedAt !== null && Date.now() - a.syncedAt.getTime() > staleAfterMs;
      return {
        id:        a.id,
        email:     a.email,
        syncedAt:  a.syncedAt?.toISOString() ?? null,
        syncError: a.syncError,
        isPrimary: a.isPrimary,
        stale:     isStale,
        healthy:   !a.syncError && !isStale,
      };
    };

    const accounts = (user?.gmailAccounts ?? []).map(describe);

    return NextResponse.json({
      // `connected` and the four flat fields describe the PRIMARY mailbox and
      // are kept so nothing reading the old shape breaks.
      connected:      !!user?.gmailRefreshToken,
      gmailEmail:     user?.gmailEmail ?? null,
      gmailSyncedAt:  syncedAt?.toISOString() ?? null,
      gmailSyncError: user?.gmailSyncError ?? null,
      stale,
      healthy:        !!user?.gmailRefreshToken && !user?.gmailSyncError && !stale,
      // Every connected mailbox. This is what Settings renders.
      accounts,
    });
  }

  // ── Return the OAuth URL for the client to redirect to ──────────────────
  if (action === "url") {
    if (!CLIENT_ID) {
      return NextResponse.json({ error: "GOOGLE_CLIENT_ID not configured" }, { status: 503 });
    }
    const url = oauthUrl(userId);
    return NextResponse.json({ url });
  }

  // ── Disconnect ────────────────────────────────────────────────────────────
  //
  // With `accountId`, one mailbox. Without it, all of them, which is what the
  // old single-connection Disconnect button meant and still means.
  if (action === "disconnect") {
    const me = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { email: userEmail }] },
      select: { id: true },
    });
    if (!me) return NextResponse.redirect(new URL("/settings?gmail=error&reason=no_user", BASE_URL));

    const accountId = searchParams.get("accountId");
    if (accountId) {
      // Scoped to this admin's own mailboxes: an id from elsewhere must not
      // disconnect somebody else's inbox.
      const account = await prisma.gmailAccount.findFirst({
        where: { id: accountId, userId: me.id },
        select: { id: true, isPrimary: true },
      });
      if (!account) {
        return NextResponse.redirect(new URL("/settings?gmail=error&reason=unknown_account", BASE_URL));
      }
      await prisma.gmailAccount.delete({ where: { id: account.id } });

      // Removing the primary would otherwise leave session provisioning with a
      // dead calendar credential, so another mailbox takes over. If there is
      // no other, the user columns are cleared.
      if (account.isPrimary) await promotePrimary(me.id);
      return NextResponse.redirect(new URL("/settings?gmail=disconnected", BASE_URL));
    }

    await prisma.gmailAccount.deleteMany({ where: { userId: me.id } });
    await prisma.user.update({
      where: { id: me.id },
      data:  { gmailRefreshToken: null, gmailEmail: null, gmailSyncedAt: null, gmailSyncError: null },
    });
    return NextResponse.redirect(new URL("/settings?gmail=disconnected", BASE_URL));
  }

  // ── OAuth callback — exchange code for tokens ─────────────────────────────
  if (code) {
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id:     CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri:  REDIRECT_URI,
          grant_type:    "authorization_code",
        }),
      });
      const tokens = await tokenRes.json() as {
        access_token?: string; refresh_token?: string; error?: string;
      };
      if (tokens.error || !tokens.refresh_token) {
        console.error("Gmail OAuth token error:", JSON.stringify(tokens));
        const errParam = encodeURIComponent(tokens.error ?? "no_refresh_token");
        return NextResponse.redirect(new URL(`/settings?gmail=error&reason=${errParam}`, BASE_URL));
      }

      // Get the Gmail address associated with this token
      const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileRes.json() as { email?: string };

      const address = (profile.email ?? "").toLowerCase();
      if (!address) {
        return NextResponse.redirect(new URL("/settings?gmail=error&reason=no_address", BASE_URL));
      }

      const me = await prisma.user.findFirst({
        where: { OR: [{ id: userId }, { email: userEmail }] },
        select: { id: true },
      });
      if (!me) return NextResponse.redirect(new URL("/settings?gmail=error&reason=no_user", BASE_URL));

      /**
       * Added, not swapped in.
       *
       * This used to overwrite the single token on the user row, so connecting
       * a second mailbox silently disconnected the first. Dan has two, and the
       * one that lost was the one he actually sends Vantage mail from.
       *
       * Keyed on the address, so reconnecting the SAME mailbox refreshes it in
       * place rather than failing on the unique index. `syncedAt` resets to
       * null because a new token starts a new watermark.
       */
      const existing = await prisma.gmailAccount.findUnique({
        where:  { email: address },
        select: { id: true, userId: true, isPrimary: true },
      });

      // A mailbox belongs to one person. Someone else's is not ours to take.
      if (existing && existing.userId !== me.id) {
        return NextResponse.redirect(
          new URL("/settings?gmail=error&reason=mailbox_claimed", BASE_URL));
      }

      const isFirst = (await prisma.gmailAccount.count({ where: { userId: me.id } })) === 0;
      const primary = existing?.isPrimary ?? isFirst;

      await prisma.gmailAccount.upsert({
        where:  { email: address },
        create: {
          userId: me.id, email: address, refreshToken: tokens.refresh_token,
          syncedAt: null, syncError: null, isPrimary: primary,
        },
        update: { refreshToken: tokens.refresh_token, syncedAt: null, syncError: null },
      });

      // Mirrored onto the user row only for the primary, because session
      // provisioning reads those columns to create calendar events as this
      // person. A second mailbox must not take the calendar with it.
      if (primary) {
        await prisma.user.update({
          where: { id: me.id },
          data:  {
            gmailRefreshToken: tokens.refresh_token,
            gmailEmail:        address,
            gmailSyncedAt:     null,
            gmailSyncError:    null,
          },
        });
      }

      return NextResponse.redirect(new URL("/settings?gmail=connected", BASE_URL));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Gmail OAuth callback error:", msg);
      return NextResponse.redirect(new URL(`/settings?gmail=error&reason=${encodeURIComponent("catch:" + msg.slice(0, 80))}`, BASE_URL));
    }
  }

  return NextResponse.redirect(new URL("/settings", BASE_URL));
}
