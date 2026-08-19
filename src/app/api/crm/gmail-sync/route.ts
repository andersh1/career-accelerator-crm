/**
 * POST /api/crm/gmail-sync
 * Pulls the last 100 sent emails from Gmail, matches them to leads by email address,
 * and logs any new ones to the LeadActivity timeline.
 * Returns { synced: number, skipped: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";

// ── Refresh the access token from the stored refresh token ─────────────────
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
    const data = await res.json() as { access_token?: string; error?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

// ── Decode base64url ────────────────────────────────────────────────────────
function decodeBase64(str: string) {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

// ── Extract header value from Gmail message headers ─────────────────────────
function getHeader(headers: { name: string; value: string }[], name: string) {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

// ── Extract plain-text body from Gmail message payload ─────────────────────
function extractBody(payload: GmailPayload): string {
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  return "";
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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sessionUser = (session as { user: { id: string; email?: string } }).user;
  const userId    = sessionUser.id;
  const userEmail = sessionUser.email ?? "";

  // ── Load this admin's Gmail refresh token ───────────────────────────────
  const user = await prisma.user.findFirst({
    where:  { OR: [{ id: userId }, { email: userEmail }] },
    select: { id: true, gmailRefreshToken: true, gmailSyncedAt: true, gmailEmail: true },
  });

  if (!user?.gmailRefreshToken) {
    return NextResponse.json({ error: "Gmail not connected. Connect in Settings first." }, { status: 400 });
  }

  const accessToken = await getAccessToken(user.gmailRefreshToken);
  if (!accessToken) {
    return NextResponse.json({ error: "Could not refresh Gmail access token. Reconnect in Settings." }, { status: 401 });
  }

  // Record the sync start time — use this as the new watermark so any messages
  // that fail mid-loop are retried next time (dedup prevents double-counting successes).
  const syncStart = new Date();

  // ── Build query: sent mail after the last sync (or last 30 days if first sync) ──
  const after = user.gmailSyncedAt
    ? Math.floor(user.gmailSyncedAt.getTime() / 1000)
    : Math.floor((Date.now() - 30 * 86400000) / 1000);

  const query = encodeURIComponent(`in:sent after:${after}`);
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!listRes.ok) {
    const err = await listRes.text();
    return NextResponse.json({ error: `Gmail API error: ${err}` }, { status: 500 });
  }

  const listData = await listRes.json() as { messages?: { id: string }[] };
  const messageIds = listData.messages ?? [];

  if (messageIds.length === 0) {
    await prisma.user.update({ where: { id: user.id }, data: { gmailSyncedAt: syncStart } });
    return NextResponse.json({ synced: 0, skipped: 0 });
  }

  // ── Load all leads' email addresses for matching ────────────────────────
  const leads = await prisma.lead.findMany({ select: { id: true, email: true } });
  const emailToLeadId = new Map(leads.map(l => [l.email.toLowerCase(), l.id]));

  let synced  = 0;
  let skipped = 0;

  // ── Fetch each message and check if recipient is a known lead ──────────
  for (const { id: msgId } of messageIds) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!msgRes.ok) { skipped++; continue; }

      const msg = await msgRes.json() as GmailMessage;
      const headers = msg.payload.headers ?? [];

      const to      = getHeader(headers, "To");
      const subject = getHeader(headers, "Subject");
      const dateStr = getHeader(headers, "Date");
      const sentAt  = dateStr ? new Date(dateStr) : new Date();

      // Extract recipient emails from "To" header (may have multiple)
      const toEmails = to
        .split(/[,;]/)
        .map(s => {
          const match = s.match(/<([^>]+)>/);
          return (match ? match[1] : s).trim().toLowerCase();
        })
        .filter(Boolean);

      // Find any lead that matches
      for (const recipientEmail of toEmails) {
        const leadId = emailToLeadId.get(recipientEmail);
        if (!leadId) continue;

        // Check if we already logged this Gmail message
        const exists = await prisma.leadActivity.findFirst({
          where: { leadId, source: "GMAIL_SYNC", metadata: { contains: msgId } },
        });
        if (exists) { skipped++; continue; }

        const bodyText = extractBody(msg.payload);

        await prisma.leadActivity.create({
          data: {
            leadId,
            type:      "EMAIL",
            subject:   subject || "(no subject)",
            emailTo:   recipientEmail,
            content:   bodyText.slice(0, 4000), // cap at 4k chars
            source:    "GMAIL_SYNC",
            createdBy: userId,
            metadata:  JSON.stringify({ gmailMessageId: msgId }),
            createdAt: sentAt,
          },
        });
        synced++;
      }
    } catch {
      skipped++;
    }
  }

  await prisma.user.update({ where: { id: user.id }, data: { gmailSyncedAt: syncStart } });

  return NextResponse.json({ synced, skipped });
}
