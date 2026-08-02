interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory sliding-window limiter. Good enough for local/single-instance
// deployments; on serverless (e.g. Vercel) this resets on cold start and
// isn't shared across instances, so it's a best-effort mitigation, not a
// hard guarantee. Upstash Redis (or similar shared store) is the upgrade
// path if that gap matters for a given deployment.
const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count += 1;
  return true;
}
