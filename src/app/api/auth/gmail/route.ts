/**
 * GET /api/auth/gmail?code=...  — OAuth callback from Google
 * GET /api/auth/gmail?action=url — returns the OAuth consent URL to redirect to
 * GET /api/auth/gmail?action=disconnect — disconnects Gmail for this admin
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      select: { gmailEmail: true, gmailSyncedAt: true, gmailRefreshToken: true, gmailSyncError: true },
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

    return NextResponse.json({
      connected:      !!user?.gmailRefreshToken,
      gmailEmail:     user?.gmailEmail ?? null,
      gmailSyncedAt:  syncedAt?.toISOString() ?? null,
      gmailSyncError: user?.gmailSyncError ?? null,
      stale,
      healthy:        !!user?.gmailRefreshToken && !user?.gmailSyncError && !stale,
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
  if (action === "disconnect") {
    await prisma.user.updateMany({
      where: { OR: [{ id: userId }, { email: userEmail }] },
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

      await prisma.user.updateMany({
        where: { OR: [{ id: userId }, { email: userEmail }] },
        data:  {
          gmailRefreshToken: tokens.refresh_token,
          gmailEmail:        profile.email ?? null,
          gmailSyncedAt:     null,
          gmailSyncError:    null,
        },
      });

      return NextResponse.redirect(new URL("/settings?gmail=connected", BASE_URL));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Gmail OAuth callback error:", msg);
      return NextResponse.redirect(new URL(`/settings?gmail=error&reason=${encodeURIComponent("catch:" + msg.slice(0, 80))}`, BASE_URL));
    }
  }

  return NextResponse.redirect(new URL("/settings", BASE_URL));
}
