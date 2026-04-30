/**
 * In-memory sliding-window rate limiter for Hono.
 *
 * Default: 120 requests per minute per remote IP. Configurable via env vars.
 * Sufficient for free endpoints. Paid endpoints self-rate via x402 cost.
 *
 * Limitations:
 * - Single-process state. For multi-instance deployments, replace with Redis
 *   or upstream proxy rate-limiting (Cloudflare, NGINX, etc.).
 * - IP detection trusts the first comma-separated value of x-forwarded-for
 *   when present, otherwise the connecting peer.
 *
 * Configurable via env:
 *   - RATE_LIMIT_WINDOW_MS (default 60000)
 *   - RATE_LIMIT_MAX (default 120)
 */

import type { MiddlewareHandler } from "hono";

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_PER_WINDOW = Number(process.env.RATE_LIMIT_MAX ?? 120);

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

function clientKey(c: Parameters<MiddlewareHandler>[0]): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  // hono Node adapter exposes this; fallback to "unknown" otherwise.
  // @ts-ignore — adapter-specific.
  return c.env?.incoming?.socket?.remoteAddress ?? "unknown";
}

export function rateLimit(): MiddlewareHandler {
  return async (c, next) => {
    const key = clientKey(c);
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now - bucket.windowStart > WINDOW_MS) {
      buckets.set(key, { count: 1, windowStart: now });
      return next();
    }

    if (bucket.count >= MAX_PER_WINDOW) {
      const retryAfter = Math.ceil(
        (bucket.windowStart + WINDOW_MS - now) / 1000
      );
      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", String(MAX_PER_WINDOW));
      c.header("X-RateLimit-Remaining", "0");
      return c.json(
        {
          error: `Rate limit exceeded. Free endpoints capped at ${MAX_PER_WINDOW} req/${WINDOW_MS}ms/IP.`,
        },
        429
      );
    }

    bucket.count += 1;
    c.header("X-RateLimit-Limit", String(MAX_PER_WINDOW));
    c.header("X-RateLimit-Remaining", String(MAX_PER_WINDOW - bucket.count));
    return next();
  };
}
