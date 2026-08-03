/**
 * Abuse controls — SERVER ONLY.
 *
 * DISTRIBUTED, NOT PER-INSTANCE
 * -----------------------------
 * These counters used to be module-level `Map`s. On serverless that is
 * per-instance state: a caller dilutes the limit by spreading requests across
 * concurrently-warm instances, and every counter resets on redeploy. They now
 * live in Postgres behind atomic SQL functions (see `preview-store.ts` and
 * `supabase/offerr-preview-state.sql`), so one limit is enforced across every
 * instance of the deployment.
 *
 * FAIL CLOSED
 * -----------
 * If the store cannot be reached, `consume` REFUSES rather than allowing. A
 * limiter that stops limiting when its backing store is down is worse than none
 * at all, because the failure is invisible.
 *
 * NO SELLER PII IN KEYS
 * ---------------------
 * Identifiers are the signed session id and a SALTED HASH of the client IP. The
 * raw IP is never stored, and an address never appears in a key — the
 * per-property cooldown keys on the submission FINGERPRINT, which is itself a
 * keyed hash.
 */

import 'server-only';

import { createHmac } from 'node:crypto';

import { getPreviewStore, StoreUnavailableError, type RateDecision } from './preview-store.ts';

export type { RateDecision };

export interface RateRule {
  limit: number;
  windowMs: number;
}

/** Submissions are expensive downstream; reads are cheap. */
export const RATE_RULES = {
  submitPerSession: { limit: 5, windowMs: 10 * 60 * 1000 },
  submitPerIp: { limit: 15, windowMs: 10 * 60 * 1000 },
  readPerSession: { limit: 120, windowMs: 10 * 60 * 1000 },
  /** Guards the unauthenticated admission endpoint against token guessing. */
  accessPerIp: { limit: 10, windowMs: 10 * 60 * 1000 },
} as const satisfies Record<string, RateRule>;

/** A repeat evaluation of the SAME property has to wait this long. */
export const PROPERTY_COOLDOWN_MS = 60 * 1000;

/** Denial used whenever the store cannot answer. */
const CLOSED: RateDecision = { allowed: false, remaining: 0, retryAfterSeconds: 30 };

export async function consume(key: string, rule: RateRule): Promise<RateDecision> {
  try {
    return await getPreviewStore().consume(key, rule.limit, rule.windowMs);
  } catch (error) {
    if (error instanceof StoreUnavailableError) return CLOSED;
    throw error;
  }
}

/**
 * Per-property cooldown, scoped to the session so one seller re-submitting the
 * same address repeatedly is slowed without affecting anybody else.
 */
export async function checkPropertyCooldown(sid: string, fingerprint: string): Promise<RateDecision> {
  try {
    return await getPreviewStore().cooldownCheck(`cooldown:${sid}:${fingerprint}`);
  } catch (error) {
    if (error instanceof StoreUnavailableError) return CLOSED;
    throw error;
  }
}

export async function markPropertyEvaluated(sid: string, fingerprint: string): Promise<void> {
  try {
    await getPreviewStore().cooldownMark(`cooldown:${sid}:${fingerprint}`, PROPERTY_COOLDOWN_MS);
  } catch (error) {
    // Failing to RECORD a cooldown is not a reason to refuse a seller who has
    // already been evaluated successfully. The submit limits still apply.
    if (!(error instanceof StoreUnavailableError)) throw error;
  }
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
