type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): { limited: boolean; remaining: number; resetAt: number } {
  const now = Date.now();

  // Evict stale entries
  store.forEach((bucket, k) => {
    if (bucket.resetAt < now) store.delete(k);
  });

  let bucket = store.get(key);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + windowMs };
    store.set(key, bucket);
  }

  bucket.count += 1;
  const limited   = bucket.count > max;
  const remaining = Math.max(0, max - bucket.count);
  return { limited, remaining, resetAt: bucket.resetAt };
}
