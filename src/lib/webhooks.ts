// Fires an outbound webhook. Supports two targets:
//   WEBHOOK_URL        — primary (custom systems, Make.com, etc.)
//   ZAPIER_WEBHOOK_URL — Zapier-specific URL (if different)
// Both are optional; fire-and-forget with a 5s timeout.
export async function fireWebhook(event: string, data: Record<string, unknown>) {
  const urls = [
    process.env.WEBHOOK_URL,
    process.env.ZAPIER_WEBHOOK_URL,
  ].filter((u): u is string => !!u);

  if (urls.length === 0) return; // no-op if not configured

  const body = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  const headers = { "Content-Type": "application/json", "X-Event": event };

  await Promise.allSettled(
    urls.map((url) =>
      fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(5000), // 5s timeout, don't hang requests
      })
    )
  );
  // never throw — webhooks are best-effort
}
