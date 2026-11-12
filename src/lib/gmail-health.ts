/**
 * Telling somebody when the Gmail sync stops.
 *
 * The sync died for all three admins between 4 and 18 September 2026 and
 * nobody found out until 11 November. The badge now reports the truth, but a
 * badge only speaks to someone who opens Settings, and nobody opens Settings
 * to check on something they believe is working. So the failure has to come
 * to them.
 *
 * Two layers, because they fail differently:
 *
 *   · `alertGmailBroken` fires from the sync itself when a run fails. This is
 *     the fast path, same day.
 *   · `alertStaleGmailConnections` runs from the daily notifications cron and
 *     looks for connections that simply have not succeeded lately. It is the
 *     one that still works if the sync cron stops running at all — the first
 *     layer cannot report a job that never starts.
 */
import { prisma } from "@/lib/prisma";
import { sendSlack } from "@/lib/slack";

/** One alert per person per outage, not one a day. */
const RE_ALERT_AFTER_DAYS = 7;

/**
 * A connection the daily sync has not managed to use in this long is broken,
 * whatever the stored error says. Three days rather than the two the Settings
 * badge uses: the badge is read by someone already looking, so it can afford
 * to be twitchy, while this one interrupts people and should not cry wolf over
 * a single missed run.
 */
const STALE_AFTER_DAYS = 3;

const NOTIFICATION_TYPE = "GMAIL_SYNC_BROKEN";

/** Plain English, because the notification is read by people, not logs. */
export function explainGmailError(code: string | null | undefined): string {
  if (!code) return "No successful sync recently.";
  if (code === "token_refresh_failed") return "Google has revoked the connection.";
  if (code.startsWith("gmail_list_failed")) {
    return `Gmail refused the request (${code.replace("gmail_list_failed_", "HTTP ")}).`;
  }
  return code;
}

/**
 * Has this exact problem already been reported recently?
 *
 * `marker` is a stable phrase that appears naturally in the body — an email
 * address for a person, a fixed sentence for the job itself. Matching on the
 * body rather than a column because CRMNotification has no user field, and a
 * dedicated column for one notification type is not worth a migration on a
 * database two apps share.
 */
async function alreadyAlerted(marker: string): Promise<boolean> {
  const since = new Date(Date.now() - RE_ALERT_AFTER_DAYS * 86400000);
  const existing = await prisma.cRMNotification.findFirst({
    where: {
      type:      NOTIFICATION_TYPE,
      body:      { contains: marker },
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return !!existing;
}

/** The phrase that identifies a job-level alert, as opposed to a person's. */
const DEAD_JOB_MARKER = "The Gmail sync job has not run";

/**
 * Raise the alarm for one person. Returns whether anything was sent, so a
 * caller can report how many went out.
 *
 * Deduplicated on the address inside the body rather than a column, because
 * CRMNotification has no user field — only an optional lead. A dedicated
 * column for one notification type is not worth a shared-database migration.
 *
 * Never throws. An alert that fails must not take down the sync it is
 * reporting on.
 */
export async function alertGmailBroken(
  user: { email: string; gmailSyncError?: string | null; gmailSyncedAt?: Date | null },
  opts: { reason?: string } = {},
): Promise<boolean> {
  try {
    if (await alreadyAlerted(user.email)) return false;

    const why = opts.reason ?? explainGmailError(user.gmailSyncError);
    const lastSync = user.gmailSyncedAt
      ? user.gmailSyncedAt.toISOString().slice(0, 10)
      : "never";

    await prisma.cRMNotification.create({
      data: {
        type:  NOTIFICATION_TYPE,
        title: "Gmail sync has stopped",
        // The address is in the body on purpose: it is what the dedupe reads,
        // and it tells whoever sees this WHOSE connection broke.
        body:  `${user.email} — ${why} Sent email has not been logged to lead timelines since ${lastSync}. Reconnect in Settings.`,
        href:  "/settings",
      },
    });

    await sendSlack(
      `⚠️ Gmail sync has stopped for *${user.email}* — ${why} Sent email is not being logged to lead timelines (last sync ${lastSync}). Reconnect in CRM Settings.`,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Sweep for connections that have gone quiet, however they got there.
 *
 * Deliberately does not look at `gmailSyncError`: the September outage left
 * no error behind, because the code path that failed updated no row at all.
 * Anything that has not synced recently is broken, and the reason is
 * secondary to somebody being told.
 */
export async function alertStaleGmailConnections(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 86400000);

  /**
   * Per MAILBOX, not per person.
   *
   * Someone with two connected addresses can have one working and one revoked,
   * and reporting on the person would hide whichever half was broken. The
   * alert names the mailbox, which is also what the dedupe keys on.
   */
  const accounts = await prisma.gmailAccount.findMany({
    where: {
      user: { crmRole: "ADMIN" },
      // A mailbox connected but never yet synced is not evidence of a fault —
      // the first run has not happened. Only one that worked and then stopped,
      // or one carrying an explicit error, counts.
      OR: [
        { syncedAt: { lt: cutoff } },
        { syncError: { not: null } },
      ],
    },
    select: { email: true, syncedAt: true, syncError: true },
  });

  let sent = 0;
  for (const a of accounts) {
    if (await alertGmailBroken({
      email: a.email, gmailSyncedAt: a.syncedAt, gmailSyncError: a.syncError,
    })) sent++;
  }
  return sent;
}

// ── The job's own heartbeat ─────────────────────────────────────────────────

/**
 * Key in AppSetting. A row rather than a column: it belongs to the job, not to
 * any person, and the CRM schema is a subset of the LMS's, so avoiding a
 * migration for one timestamp is worth something.
 */
const HEARTBEAT_KEY = "gmail_sync_last_run";

/** The sync stamps this every time it finishes, however it went. */
export async function recordGmailSyncRun(): Promise<void> {
  const now = new Date().toISOString();
  await prisma.appSetting.upsert({
    where:  { key: HEARTBEAT_KEY },
    create: { key: HEARTBEAT_KEY, value: now },
    update: { value: now },
  }).catch(() => { /* a missing heartbeat must not fail the sync */ });
}

/**
 * Is the job running at all?
 *
 * The per-person sweep cannot answer this. Someone who has just reconnected
 * has no last-sync date to be stale, and someone whose connection is fine has
 * nothing wrong with it — so a sync cron that silently stops firing produces
 * no alert from either. This asks the only question that catches that: did the
 * job run.
 *
 * Returns the alert text, or null when everything is fine.
 */
export async function checkGmailSyncHeartbeat(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: HEARTBEAT_KEY } });

  // No heartbeat yet is not a fault — it means the sync has not run since this
  // was deployed. The first run writes one, and after that silence is real.
  if (!row) return null;

  const last = new Date(row.value);
  const daysQuiet = (Date.now() - last.getTime()) / 86400000;
  if (daysQuiet < STALE_AFTER_DAYS) return null;

  return `${DEAD_JOB_MARKER} since ${row.value.slice(0, 10)} (${Math.floor(daysQuiet)} days). No sent email is being logged to any lead timeline.`;
}

/**
 * The heartbeat check, raised the same way as a broken connection.
 *
 * Deduped on a fixed string in the body rather than an address, since this one
 * is about the job and not about a person.
 */
export async function alertDeadGmailSync(): Promise<boolean> {
  const problem = await checkGmailSyncHeartbeat();
  if (!problem) return false;

  try {
    if (await alreadyAlerted(DEAD_JOB_MARKER)) return false;

    await prisma.cRMNotification.create({
      data: {
        type:  NOTIFICATION_TYPE,
        title: "Gmail sync has stopped running",
        body:  `${problem} Check the cron on Vercel.`,
        href:  "/settings",
      },
    });
    await sendSlack(`⚠️ ${problem} Check the gmail-sync cron on Vercel.`);
    return true;
  } catch {
    return false;
  }
}
