/**
 * Cron: Daily Gmail sync — every day at 9 AM UTC
 * Schedule: "0 9 * * *"
 * Finds all CRM admins with a connected Gmail and syncs each one.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";

function authOk(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
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
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  return "";
}

async function syncUser(
  user: { id: string; gmailRefreshToken: string; gmailSyncedAt: Date | null },
  leads: { id: string; email: string }[],
): Promise<{ synced: number; skipped: number; error?: string }> {
  const accessToken = await getAccessToken(user.gmailRefreshToken);
  if (!accessToken) return { synced: 0, skipped: 0, error: "token_refresh_failed" };

  const syncStart = new Date();
  const after = user.gmailSyncedAt
    ? Math.floor(user.gmailSyncedAt.getTime() / 1000)
    : Math.floor((Date.now() - 30 * 86400000) / 1000);

  const query = encodeURIComponent(`in:sent after:${after}`);
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!listRes.ok) {
    await prisma.user.update({ where: { id: user.id }, data: { gmailSyncedAt: syncStart } });
    return { synced: 0, skipped: 0, error: "gmail_list_failed" };
  }

  const listData = await listRes.json() as { messages?: { id: string }[] };
  const messageIds = listData.messages ?? [];

  if (messageIds.length === 0) {
    await prisma.user.update({ where: { id: user.id }, data: { gmailSyncedAt: syncStart } });
    return { synced: 0, skipped: 0 };
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
            content:   bodyText.slice(0, 4000),
            source:    "GMAIL_SYNC",
            createdBy: user.id,
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
  return { synced, skipped };
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find all CRM admins with a connected Gmail
  const admins = await prisma.user.findMany({
    where:  { crmRole: "ADMIN", gmailRefreshToken: { not: null } },
    select: { id: true, email: true, gmailRefreshToken: true, gmailSyncedAt: true },
  });

  if (admins.length === 0) {
    return NextResponse.json({ message: "No admins with Gmail connected", results: [] });
  }

  // Load all leads once — shared across all admin syncs
  const leads = await prisma.lead.findMany({ select: { id: true, email: true } });

  const results = [];
  for (const admin of admins) {
    const result = await syncUser(
      { id: admin.id, gmailRefreshToken: admin.gmailRefreshToken!, gmailSyncedAt: admin.gmailSyncedAt },
      leads,
    );
    results.push({ email: admin.email, ...result });
  }

  return NextResponse.json({ results });
}
