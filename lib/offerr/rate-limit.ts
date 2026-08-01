/**
 * Preview-grade abuse controls — SERVER ONLY.
 *
 * PRODUCTION LIMITATION, STATED UP FRONT
 * --------------------------------------
 * These counters live in the process. On serverless that means per-instance,
 * so a determined caller can dilute the limit by spreading requests across
 * concurrently-warm instances, and every counter resets on redeploy. That is
 * ACCEPTABLE for a closed preview behind an access token with no seller
 * traffic; it is NOT acceptable for launch.
 *
 * Before public launch this must move to a shared store with atomic
 * increments (Upstash Redis or equivalent) and be paired with a platform-level
 * control such as Vercel BotID / WAF rate rules. Tracked in the preview docs
 * as a launch prerequisite — see docs/offerr-seller-journey-preview.md.
 *
 * No invasive fingerprinting is used. The identifiers are the signed session id
 * and a SALTED HASH of the client IP; the raw IP is never stored.
 */

import 'server-only';

import { createHmac } from 'node:crypto';

export interface RateRule {
  limit: number;
  windowMs: number;
}

/** Submissions are expensive downstream; reads are cheap. */
export const RATE_RULES = {
  submitPerSession: { limit: 5, windowMs: 10 * 60 * 1000 },
  submitPerIp: { limit: 15, windowMs: 10 * 60 * 1000 },
  readPerSession: { limit: 120, windowMs: 10 * 60 * 1000 },
} as const satisfies Record<string, RateRule>;

/** A repeat evaluation of the SAME property has to wait this long. */
export const PROPERTY_COOLDOWN_MS = 60 * 1000;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const propertyCooldowns = new Map<string, number>();

/** Bounded so a flood of distinct keys cannot grow the map without limit. */
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number) {
  if (buckets.size < MAX_TRACKED_KEYS && propertyCooldowns.size < MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  for (const [key, until] of propertyCooldowns) if (until <= now) propertyCooldowns.delete(key);
  // Still oversized after sweeping expired entries: the map is under active
  // pressure, so drop it entirely rather than grow unbounded. Failing open on
  // counts is safer than exhausting memory, and the access token still gates.
  if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear();
  if (propertyCooldowns.size >= MAX_TRACKED_KEYS) propertyCooldowns.clear();
}

export interface RateDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function consume(key: string, rule: RateRule, now = Date.now()): RateDecision {
  sweep(now);
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= rule.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: rule.limit - existing.count, retryAfterSeconds: 0 };
}

/**
 * Per-property cooldown, scoped to the session so one seller re-submitting the
 * same address repeatedly is slowed without affecting anybody else.
 */
export function checkPropertyCooldown(
  sid: string,
  fingerprint: string,
  now = Date.now(),
): RateDecision {
  sweep(now);
  const key = `${sid}:${fingerprint}`;
  const until = propertyCooldowns.get(key) ?? 0;
  if (until > now) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((until - now) / 1000) };
  }
  return { allowed: true, remaining: 1, retryAfterSeconds: 0 };
}

export function markPropertyEvaluated(sid: string, fingerprint: string, now = Date.now()) {
  propertyCooldowns.set(`${sid}:${fingerprint}`, now + PROPERTY_COOLDOWN_MS);
}

/**
 * Salted hash of the client IP. Rate limiting needs a stable per-client value;
 * it does not need the address itself, and storing the address would put seller
 * PII in memory and potentially in logs for no benefit.
 */
export function hashedClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for') ?? '';
  const raw = (forwarded.split(',')[0] || headers.get('x-real-ip') || 'unknown').trim();
  const salt = String(process.env.OFFERR_SESSION_SECRET ?? 'offerr-preview');
  return createHmac('sha256', salt).update(raw).digest('hex').slice(0, 16);
}

/** Test-only reset so suites do not leak counters into one another. */
export function __resetRateLimiterForTests() {
  buckets.clear();
  propertyCooldowns.clear();
}
