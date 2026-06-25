// In-memory sliding-window limiter for server actions (which middleware can't
// rate-limit by path, since every server action POSTs to the same page URL).
// Same single-isolate caveat as middleware.ts's rate limiter — fine at current
// scale; swap for @upstash/ratelimit if this needs to hold across instances.

const store = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 120_000);

/**
 * Returns true if the call is allowed, false if the caller has exceeded
 * `limit` calls within `windowMs` for this key (e.g. `ai-schedule:${userId}`).
 */
export function consumeRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  entry.count += 1;
  return entry.count <= limit;
}
