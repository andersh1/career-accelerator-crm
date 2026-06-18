/**
 * Rate limiter with optional Upstash Redis backend.
 * If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, uses Redis
 * (serverless-safe, shared across all instances). Otherwise falls back to
 * in-memory (dev-only — resets on cold start).
 */

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

store.forEach; // keep import happy — setInterval below handles eviction

setInterval(() => {
  const now = Date.now();
  store.forEach((bucket, k) => {
    if (bucket.resetAt < now) store.delete(k);
  });
}, 5 * 60 * 1000);

async function redisIncr(key: string, windowMs: number): Promise<{ count: number; resetAt: number } | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const windowSec = Math.ceil(windowMs / 1000);
    const res = await fetch(`${url}/pipeline`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, windowSec, "NX"],
        ["TTL", key],
      ]),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as [{ result: number }, unknown, { result: number }];
    const count   = data[0].result;
    const ttl     = data[2].result;
    const resetAt = Date.now() + (ttl > 0 ? ttl * 1000 : windowMs);
    return { count, resetAt };
  } catch {
    return null;
  }
}

export async function rateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<{ limited: boolean; remaining: number; resetAt: number }> {
  const redis = await redisIncr(key, windowMs);

  if (redis) {
    const limited   = redis.count > max;
    const remaining = Math.max(0, max - redis.count);
    return { limited, remaining, resetAt: redis.resetAt };
  }

  const now = Date.now();
  let bucket = store.get(key);

  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 1, resetAt: now + windowMs };
    store.set(key, bucket);
    return { limited: false, remaining: max - 1, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  const limited   = bucket.count > max;
  const remaining = Math.max(0, max - bucket.count);
  return { limited, remaining, resetAt: bucket.resetAt };
}
