/**
 * Reading one connected mailbox and filing what it finds onto lead timelines.
 *
 * This lived twice, once in the daily cron and once behind the Sync Now
 * button, as two near-identical copies. They had already drifted: the cron
 * recorded a failure reason and the manual route did not. One copy now, so a
 * fix to how a sync behaves is a fix to both.
 *
 * A sync reads SENT mail only. Replies from a Fellow, a parent or a partner
 * have never been visible to it; that is what the Cc address is for.
 */
import { prisma } from "@/lib/prisma";
import { alertGmailBroken } from "@/lib/gmail-health";

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";

/** How far back a brand new connection looks on its first run. */
const FIRST_RUN_DAYS = 30;

export interface SyncableAccount {
  id: string;
  userId: string;
  email: string;
  refreshToken: string;
  syncedAt: Date | null;
  isPrimary: boolean;
}

export interface SyncResult {
  mailbox: string;
  synced: number;
  skipped: number;
  error?: string;
}

async function getAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type:    "refresh_token",
      }),
    });
    const data = await res.json() as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

function decodeBase64(str: string) {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function getHeader(headers: { name: string; value: string }[], name: string) {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

interface GmailPayload {
  mimeType?: string;
  body?:     { data?: string };
  parts?:    GmailPayload[];
  headers?:  { name: string; value: string }[];
}

interface GmailMessage {
  id:      string;
  payload: GmailPayload;
}

function extractBody(payload: GmailPayload): string {
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }
  for (const part of payload.parts ?? []) {
    const text = extractBody(part);
    if (text) return text;
  }
  return "";
}

/**
 * Write the outcome of a run to the mailbox, and to the user row when this is
 * their primary.
 *
 * The User columns are not dead: session provisioning reads
 * `gmailRefreshToken` to create calendar events as that person. Mirroring the
 * primary's state keeps that path working exactly as it did, so adding a
 * second mailbox changes nothing about the calendar.
 */
async function recordOutcome(
  account: SyncableAccount,
  data: { syncedAt?: Date; syncError: string | null },
): Promise<void> {
  await prisma.gmailAccount.update({
    where: { id: account.id },
    data:  { ...(data.syncedAt ? { syncedAt: data.syncedAt } : {}), syncError: data.syncError },
  }).catch(() => {});

  if (!account.isPrimary) return;
  await prisma.user.update({
    where: { id: account.userId },
    data:  {
      ...(data.syncedAt ? { gmailSyncedAt: data.syncedAt } : {}),
      gmailSyncError: data.syncError,
    },
  }).catch(() => {});
}

/**
 * Sync one mailbox.
 *
 * `leads` is passed in rather than loaded here so a run over several mailboxes
 * reads the lead table once.
 */
export async function syncGmailAccount(
  account: SyncableAccount,
  leads: { id: string; email: string }[],
): Promise<SyncResult> {
  const accessToken = await getAccessToken(account.refreshToken);
  if (!accessToken) {
    // Recorded, not swallowed. This is the failure that ran silently from
    // September 2026: it returned without touching any row, so the timestamp
    // froze, Settings kept showing a green badge, and nothing was logged for
    // two months.
    await recordOutcome(account, { syncError: "token_refresh_failed" });
    await alertGmailBroken({
      email: account.email,
      gmailSyncError: "token_refresh_failed",
      gmailSyncedAt: account.syncedAt,
    });
    return { mailbox: account.email, synced: 0, skipped: 0, error: "token_refresh_failed" };
  }

  const syncStart = new Date();
  const after = account.syncedAt
    ? Math.floor(account.syncedAt.getTime() / 1000)
    : Math.floor((Date.now() - FIRST_RUN_DAYS * 86400000) / 1000);

  const query = encodeURIComponent(`in:sent after:${after}`);
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!listRes.ok) {
    const code = `gmail_list_failed_${listRes.status}`;
    await recordOutcome(account, { syncedAt: syncStart, syncError: code });
    await alertGmailBroken({
      email: account.email, gmailSyncError: code, gmailSyncedAt: account.syncedAt,
    });
    return { mailbox: account.email, synced: 0, skipped: 0, error: code };
  }

  const listData = await listRes.json() as { messages?: { id: string }[] };
  const messageIds = listData.messages ?? [];

  if (messageIds.length === 0) {
    await recordOutcome(account, { syncedAt: syncStart, syncError: null });
    return { mailbox: account.email, synced: 0, skipped: 0 };
  }

  const emailToLeadId = new Map(leads.map(l => [l.email.toLowerCase(), l.id]));
  let synced = 0;
  let skipped = 0;

  for (const { id: msgId } of messageIds) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!msgRes.ok) { skipped++; continue; }

      const msg = await msgRes.json() as GmailMessage;
      const headers = msg.payload.headers ?? [];
      const to      = getHeader(headers, "To");
      const subject = getHeader(headers, "Subject");
      const dateStr = getHeader(headers, "Date");
      const sentAt  = dateStr ? new Date(dateStr) : new Date();

      const toEmails = to
        .split(/[,;]/)
        .map(s => {
          const match = s.match(/<([^>]+)>/);
          return (match ? match[1] : s).trim().toLowerCase();
        })
        .filter(Boolean);

      for (const recipientEmail of toEmails) {
        const leadId = emailToLeadId.get(recipientEmail);
        if (!leadId) continue;

        // Gmail message ids are per mailbox, so two connected mailboxes cannot
        // collide here even on the same conversation.
        const exists = await prisma.leadActivity.findFirst({
          where: { leadId, source: "GMAIL_SYNC", metadata: { contains: msgId } },
          select: { id: true },
        });
        if (exists) { skipped++; continue; }

        const bodyText = extractBody(msg.payload);
        await prisma.leadActivity.create({
          data: {
            leadId,
            type:      "EMAIL",
            subject:   subject || "(no subject)",
            emailTo:   recipientEmail,
            content:   bodyText.slice(0, 4000),
            source:    "GMAIL_SYNC",
            createdBy: account.userId,
            // `mailbox` so a timeline can say which of someone's addresses an
            // email was sent from, now that a person can have more than one.
            metadata:  JSON.stringify({ gmailMessageId: msgId, mailbox: account.email }),
            createdAt: sentAt,
          },
        });
        synced++;
      }
    } catch {
      skipped++;
    }
  }

  // Cleared, so a connection that recovers stops being reported as broken.
  await recordOutcome(account, { syncedAt: syncStart, syncError: null });
  return { mailbox: account.email, synced, skipped };
}

/** Every mailbox belonging to CRM admins, or to one person when given an id. */
export async function syncableAccounts(userId?: string): Promise<SyncableAccount[]> {
  return prisma.gmailAccount.findMany({
    where: userId ? { userId } : { user: { crmRole: "ADMIN" } },
    select: { id: true, userId: true, email: true, refreshToken: true, syncedAt: true, isPrimary: true },
    orderBy: [{ isPrimary: "desc" }, { email: "asc" }],
  });
}

/** Run every given mailbox in turn, reading the lead table once. */
export async function syncAccounts(accounts: SyncableAccount[]): Promise<SyncResult[]> {
  if (accounts.length === 0) return [];
  const leads = await prisma.lead.findMany({ select: { id: true, email: true } });
  const results: SyncResult[] = [];
  for (const account of accounts) {
    results.push(await syncGmailAccount(account, leads));
  }
  return results;
}

/**
 * Hand the primary role, and the calendar credential, to another mailbox.
 *
 * Session provisioning reads User.gmailRefreshToken to create calendar events
 * as this person. Deleting the primary without this would leave those columns
 * pointing at a token that no longer exists, and the next provisioning run
 * would fail with nothing on screen to explain why.
 *
 * Oldest remaining mailbox wins, which is the one most likely to be the
 * long-standing work account rather than something just added.
 */
export async function promotePrimary(userId: string): Promise<void> {
  const next = await prisma.gmailAccount.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, refreshToken: true, syncedAt: true, syncError: true },
  });

  if (!next) {
    await prisma.user.update({
      where: { id: userId },
      data:  { gmailRefreshToken: null, gmailEmail: null, gmailSyncedAt: null, gmailSyncError: null },
    });
    return;
  }

  await prisma.gmailAccount.update({ where: { id: next.id }, data: { isPrimary: true } });
  await prisma.user.update({
    where: { id: userId },
    data:  {
      gmailRefreshToken: next.refreshToken,
      gmailEmail:        next.email,
      gmailSyncedAt:     next.syncedAt,
      gmailSyncError:    next.syncError,
    },
  });
}
