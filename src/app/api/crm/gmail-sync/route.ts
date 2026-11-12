/**
 * POST /api/crm/gmail-sync
 *
 * Sync Now. Reads every mailbox this admin has connected and logs any sent
 * email addressed to a lead onto that lead's timeline.
 *
 * Body: optional { accountId } to sync one mailbox instead of all of them.
 * Returns { synced, skipped, results } — the totals the button reports, plus
 * a per-mailbox breakdown now that a person can have more than one.
 *
 * The reading itself lives in lib/gmail-sync, shared with the daily cron.
 * These were two near-identical copies and had already drifted: the cron
 * recorded a failure reason and this route did not.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncableAccounts, syncAccounts } from "@/lib/gmail-sync";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sessionUser = (session as { user: { id: string; email?: string } }).user;

  const me = await prisma.user.findFirst({
    where:  { OR: [{ id: sessionUser.id }, { email: sessionUser.email ?? "" }] },
    select: { id: true },
  });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { accountId?: string };

  let accounts = await syncableAccounts(me.id);
  if (body.accountId) {
    // Scoped to this admin's own mailboxes, so an id from elsewhere cannot be
    // used to run somebody else's inbox.
    accounts = accounts.filter(a => a.id === body.accountId);
    if (accounts.length === 0) {
      return NextResponse.json({ error: "That mailbox is not connected to your account." }, { status: 404 });
    }
  }

  if (accounts.length === 0) {
    return NextResponse.json({ error: "Gmail not connected. Connect in Settings first." }, { status: 400 });
  }

  const results = await syncAccounts(accounts);

  // A refresh failure is the one worth surfacing as an error rather than a
  // zero: it means the connection is dead, not that there was nothing to find.
  const allFailed = results.every(r => r.error);
  if (allFailed) {
    return NextResponse.json({
      error: results.length === 1
        ? "Could not refresh Gmail access. Reconnect in Settings."
        : "Could not refresh any connected mailbox. Reconnect in Settings.",
      results,
    }, { status: 401 });
  }

  return NextResponse.json({
    synced:  results.reduce((n, r) => n + r.synced, 0),
    skipped: results.reduce((n, r) => n + r.skipped, 0),
    results,
  });
}
