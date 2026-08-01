/**
 * Session-bound result store — SERVER ONLY.
 *
 * AUTHORIZATION MODEL
 * -------------------
 * A result id is an OPAQUE HANDLE, never a capability. Every read requires the
 * id AND the session id that created it. Presenting a valid id from a different
 * session is refused as `not_found` — deliberately indistinguishable from an id
 * that never existed, so the endpoint cannot be used to test whether a given
 * result exists.
 *
 * IDEMPOTENCY
 * -----------
 * Submissions are keyed by the server-derived idempotency key. A refresh, a
 * double-click, or a retry of the same answers returns the SAME stored result
 * rather than starting a second evaluation, so no duplicate snapshot is created
 * downstream. An in-flight submission is recorded before the upstream call so
 * two concurrent submits collapse onto one.
 *
 * PRODUCTION LIMITATION
 * ---------------------
 * In-process and therefore per-instance and non-durable, exactly like the rate
 * limiter. Fine for a closed preview; must become a shared store (Redis, or the
 * Offerr tables themselves once activation is approved) before launch.
 */

import 'server-only';

import { RESULT_TTL_MS } from './session.ts';
import type { SellerSafeResult } from './outcomes.ts';

interface StoredResult {
  resultId: string;
  sid: string;
  idempotencyKey: string;
  result: SellerSafeResult;
  createdAt: number;
  expiresAt: number;
}

const byResultId = new Map<string, StoredResult>();
const byIdempotencyKey = new Map<string, string>();
/** Idempotency keys whose upstream call is currently in flight. */
const inFlight = new Map<string, Promise<StoredResult>>();

const MAX_RESULTS = 5_000;

function sweep(now: number) {
  for (const [id, stored] of byResultId) {
    if (stored.expiresAt <= now) {
      byResultId.delete(id);
      byIdempotencyKey.delete(stored.idempotencyKey);
    }
  }
  if (byResultId.size >= MAX_RESULTS) {
    // Evict oldest first rather than clearing: dropping everything would log
    // out every seller mid-journey.
    const ordered = [...byResultId.values()].sort((a, b) => a.createdAt - b.createdAt);
    for (const stored of ordered.slice(0, Math.ceil(MAX_RESULTS / 4))) {
      byResultId.delete(stored.resultId);
      byIdempotencyKey.delete(stored.idempotencyKey);
    }
  }
}

export function putResult(entry: {
  resultId: string;
  sid: string;
  idempotencyKey: string;
  result: SellerSafeResult;
  now?: number;
}): StoredResult {
  const now = entry.now ?? Date.now();
  sweep(now);
  const stored: StoredResult = {
    resultId: entry.resultId,
    sid: entry.sid,
    idempotencyKey: entry.idempotencyKey,
    result: entry.result,
    createdAt: now,
    expiresAt: now + RESULT_TTL_MS,
  };
  byResultId.set(stored.resultId, stored);
  byIdempotencyKey.set(stored.idempotencyKey, stored.resultId);
  return stored;
}

export type ReadOutcome =
  | { status: 'ok'; result: SellerSafeResult; expiresAt: number }
  | { status: 'not_found' }
  | { status: 'expired' };

/**
 * Read a result. `sid` is REQUIRED and must match the creating session; a
 * mismatch is reported as `not_found`, never as `forbidden`, so the caller
 * learns nothing about whether the id is real.
 */
export function readResult(resultId: string, sid: string, now = Date.now()): ReadOutcome {
  const stored = byResultId.get(resultId);
  if (!stored) return { status: 'not_found' };
  if (stored.sid !== sid) return { status: 'not_found' };
  if (stored.expiresAt <= now) {
    byResultId.delete(resultId);
    byIdempotencyKey.delete(stored.idempotencyKey);
    return { status: 'expired' };
  }
  return { status: 'ok', result: stored.result, expiresAt: stored.expiresAt };
}

/** Existing result for a server-derived idempotency key, if still live. */
export function findByIdempotencyKey(
  idempotencyKey: string,
  sid: string,
  now = Date.now(),
): StoredResult | null {
  const resultId = byIdempotencyKey.get(idempotencyKey);
  if (!resultId) return null;
  const stored = byResultId.get(resultId);
  if (!stored) return null;
  if (stored.sid !== sid) return null;
  if (stored.expiresAt <= now) return null;
  return stored;
}

/**
 * Collapse concurrent submissions of the same key onto a single upstream call.
 * Without this, a double-click fires two evaluations before either has stored a
 * result, and the idempotency check above cannot help because neither has
 * finished yet.
 */
export async function runOnceForKey(
  idempotencyKey: string,
  work: () => Promise<StoredResult>,
): Promise<StoredResult> {
  const existing = inFlight.get(idempotencyKey);
  if (existing) return existing;

  const promise = work().finally(() => {
    inFlight.delete(idempotencyKey);
  });
  inFlight.set(idempotencyKey, promise);
  return promise;
}

export function __resetResultStoreForTests() {
  byResultId.clear();
  byIdempotencyKey.clear();
  inFlight.clear();
}

export type { StoredResult };
