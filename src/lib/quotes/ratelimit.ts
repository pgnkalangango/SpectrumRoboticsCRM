// Light in memory rate limit for the public quote and invoice pages. Good enough for a single
// server; a shared store would replace this if the app ever runs on several instances.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function allowRequest(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}
