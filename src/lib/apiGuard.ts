import { NextRequest, NextResponse } from 'next/server';

/**
 * Lightweight abuse protection for browser-triggered API routes.
 *
 * Threat model: once Guardian AI is deployed to a public URL, anyone who
 * discovers /api/send-alert could POST to it and spam the operator's real
 * Telegram chat. We cannot defend this with a shared secret embedded in the
 * client, because the browser bundle is public - any "secret" shipped to the
 * client is readable by the attacker. So instead we use two server-side
 * checks that need no client cooperation:
 *
 *   1. Same-origin enforcement - a genuine browser fetch from the deployed
 *      app always sends an Origin header matching the app's own host. A
 *      drive-by `curl` sends none. This blocks the lazy abuse vector at zero
 *      cost and works perfectly on stateless serverless (Vercel).
 *
 *   2. Best-effort rate limiting - caps requests per client IP within a
 *      sliding window. On serverless this is per-warm-instance (state resets
 *      on cold start), so it is a speed bump, not a guarantee - but it
 *      meaningfully throttles a burst hitting the same instance. A production
 *      deployment would back this with Upstash/Redis; that is out of scope
 *      for the hackathon MVP.
 *
 * A determined attacker can forge an Origin header, so this is defense in
 * depth appropriate for a demo, not hardened auth. It is, however, strictly
 * better than a client-shipped shared secret.
 */

interface RateLimitOptions {
  /** Max requests allowed per IP within the window. */
  max: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
}

const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  max: Number(process.env.GUARDIAN_ALERT_RATE_MAX ?? 8),
  windowMs: Number(process.env.GUARDIAN_ALERT_RATE_WINDOW_MS ?? 5 * 60 * 1000),
};

// Per-IP request timestamps. Module-scoped so it survives between requests on
// a warm serverless instance. Not shared across instances - see note above.
const requestLog = new Map<string, number[]>();

const getClientIp = (request: NextRequest): string => {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for may be a comma-separated list; the first entry is the
    // original client.
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
};

const hostOf = (value: string | null): string | null => {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    // Some clients send a bare host rather than a full URL.
    return value;
  }
};

/**
 * Reject the request if its Origin (or Referer) does not match the host the
 * request was sent to. Requests with no Origin at all are also rejected,
 * because legitimate browser POSTs from this app always include one.
 *
 * Set GUARDIAN_DISABLE_ORIGIN_CHECK=true to bypass (useful for local curl
 * testing or server-to-server callers).
 *
 * Returns a NextResponse to short-circuit with, or null if the check passes.
 */
export const enforceSameOrigin = (request: NextRequest): NextResponse | null => {
  if (process.env.GUARDIAN_DISABLE_ORIGIN_CHECK === 'true') {
    return null;
  }

  const requestHost = request.headers.get('host');
  const originHost = hostOf(request.headers.get('origin')) ?? hostOf(request.headers.get('referer'));

  if (!originHost || !requestHost || originHost !== requestHost) {
    return NextResponse.json(
      { error: 'Cross-origin requests are not allowed for this endpoint.' },
      { status: 403 },
    );
  }

  return null;
};

/**
 * Enforce a per-IP sliding-window rate limit. Returns a 429 NextResponse when
 * the limit is exceeded, or null when the request is within budget.
 */
export const enforceRateLimit = (
  request: NextRequest,
  options: RateLimitOptions = DEFAULT_RATE_LIMIT,
): NextResponse | null => {
  const ip = getClientIp(request);
  const now = Date.now();
  const windowStart = now - options.windowMs;

  const recent = (requestLog.get(ip) ?? []).filter((timestamp) => timestamp > windowStart);

  if (recent.length >= options.max) {
    const retryAfterSeconds = Math.ceil(
      (recent[0] + options.windowMs - now) / 1000,
    );
    return NextResponse.json(
      { error: 'Too many alert requests. Please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfterSeconds)) } },
    );
  }

  recent.push(now);
  requestLog.set(ip, recent);

  // Opportunistic cleanup so the Map does not grow unbounded on a long-lived
  // instance: drop any IPs whose entries have all aged out.
  if (requestLog.size > 1000) {
    Array.from(requestLog.entries()).forEach(([key, timestamps]) => {
      if (timestamps.every((timestamp: number) => timestamp <= windowStart)) {
        requestLog.delete(key);
      }
    });
  }

  return null;
};

/**
 * Convenience: run the standard guard chain (origin then rate limit) for a
 * sensitive browser-triggered route. Returns a NextResponse to return early,
 * or null to proceed.
 */
export const guardSensitiveRoute = (request: NextRequest): NextResponse | null => {
  return enforceSameOrigin(request) ?? enforceRateLimit(request);
};
