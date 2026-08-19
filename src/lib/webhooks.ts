import { prisma } from "@/lib/prisma";

// Fires an outbound webhook. Supports two targets, checked in this order:
//   1. DB (AppSetting keys: webhook_url, zapier_webhook_url) — set via Automation page
//   2. Environment variables (WEBHOOK_URL, ZAPIER_WEBHOOK_URL) — Vercel project settings
// Both slots can be active simultaneously. Fire-and-forget with a 5s timeout.
export async function fireWebhook(event: string, data: Record<string, unknown>) {
  // Load DB-saved URLs
  let dbWebhookUrl: string | null = null;
  let dbZapierUrl: string | null = null;
  try {
    const settings = await prisma.appSetting.findMany({
      where: { key: { in: ["webhook_url", "zapier_webhook_url"] } },
    });
    for (const s of settings) {
      if (s.key === "webhook_url")        dbWebhookUrl = s.value || null;
      if (s.key === "zapier_webhook_url") dbZapierUrl  = s.value || null;
    }
  } catch {
    // DB unavailable — fall through to env vars
  }

  const urls = Array.from(new Set([
    dbWebhookUrl        ?? process.env.WEBHOOK_URL,
    dbZapierUrl         ?? process.env.ZAPIER_WEBHOOK_URL,
  ].filter((u): u is string => !!u)));

  if (urls.length === 0) return;

  const body    = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  const headers = { "Content-Type": "application/json", "X-Event": event };

  await Promise.allSettled(
    urls.map((url) =>
      fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(5000),
      })
    )
  );
  // never throw — webhooks are best-effort
}
