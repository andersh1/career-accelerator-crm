/**
 * Cron: daily Gmail sync — every day at 9 AM UTC
 * Schedule: "0 9 * * *"
 *
 * Runs every mailbox connected by a CRM admin, not one per person: Dan works
 * out of dan@10ximpact.co and dan@vantagecareer.co, and syncing only one of
 * them is how months of his sent mail went unlogged.
 *
 * The reading itself lives in lib/gmail-sync so the Sync Now button runs the
 * same code.
 */
import { NextRequest, NextResponse } from "next/server";
import { recordGmailSyncRun } from "@/lib/gmail-health";
import { syncableAccounts, syncAccounts } from "@/lib/gmail-sync";

// Fail closed, like the other five crons. This used to `return true` when
// CRON_SECRET was unset, so a missing or renamed variable would have taken the
// other five crons quiet and made this one — the one that pulls a Google
// mailbox into the database — public. Found in the 2026-11-06 audit.
function authOk(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Stamped before the early return as well as after the work: "nobody has
  // Gmail connected" is still the job having run, and leaving it unstamped
  // would have the heartbeat check report a dead cron that is running fine.
  await recordGmailSyncRun();

  const accounts = await syncableAccounts();
  if (accounts.length === 0) {
    return NextResponse.json({ message: "No mailboxes connected", results: [] });
  }

  const results = await syncAccounts(accounts);
  return NextResponse.json({ results });
}
