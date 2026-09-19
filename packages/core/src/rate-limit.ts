import { redis } from "./redis.js";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

/**
 * Fixed-window counter. `key` should include the subject, e.g. `sms:${userId}`.
 * Fails open if Redis is unreachable so an outage doesn't block every user; the error is rethrown
 * only when `failClosed` is set (auth endpoints).
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  opts: { failClosed?: boolean } = {},
): Promise<RateLimitResult> {
  const k = `rl:${key}`;
  try {
    const [[, count], [, ttl]] = (await redis().multi().incr(k).ttl(k).exec()) as [
      [Error | null, number],
      [Error | null, number],
    ];
    if (ttl < 0) await redis().expire(k, windowSeconds);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetSeconds: ttl < 0 ? windowSeconds : ttl,
    };
  } catch (err) {
    if (opts.failClosed) throw err;
    return { allowed: true, remaining: limit, resetSeconds: windowSeconds };
  }
}
