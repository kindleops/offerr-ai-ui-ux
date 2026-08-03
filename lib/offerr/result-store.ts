/**
 * Session-bound durable result store — SERVER ONLY.
 *
 * AUTHORIZATION MODEL
 * -------------------
 * A result id is an OPAQUE HANDLE, never a capability. Every read requires the
 * id AND the session id that created it. Presenting a valid id from a different
 * session is refused as `not_found` — deliberately indistinguishable from an id
 * that never existed, so the endpoint cannot be used to test whether a given
 * result exists. That check lives in SQL (`offerr_preview.read_result`), not
 * here, so it cannot be bypassed by a future caller.
 *
 * DISTRIBUTED SINGLE-FLIGHT
 * -------------------------
 * The old implementation collapsed concurrent submissions with an in-process
 * promise map, which only works when both requests land on the same instance.
 * `runOnceForKey` now takes an atomic RESERVATION in Postgres before the
 * upstream call:
 *
 *   - exactly one caller wins the reservation and performs the evaluation;
 *   - every other caller — on any instance — observes the pending reservation
 *     and waits for the winner's result rather than starting a second one;
 *   - a reservation carries a LEASE, so an instance that dies mid-call cannot
 *     wedge the key until its TTL expires.
 *
 * RETRYABLE FAILURES ARE NOT CACHED
 * ---------------------------------
 * A transient upstream failure releases the reservation instead of storing it.
 * Caching one would tell the seller "try again in a moment" and then replay the
 * same failure for the whole result TTL, and would burn the property cooldown
 * on an evaluation that produced nothing.
 */

import 'server-only';

import { RESULT_TTL_MS } from './session.ts';
import type { SellerSafeResult } from './outcomes.ts';
import { getPreviewStore, StoreUnavailableError, type ReadOutcome } from './preview-store.ts';

export type { ReadOutcome };

/** How long a reservation holder may take before another caller may reclaim it. */
const RESERVATION_LEASE_MS = 45_000;
/** How long a loser waits for the winner, and how often it re-checks. */
const WAIT_TIMEOUT_MS = 40_000;
const WAIT_POLL_MS = 400;

export interface StoredResult {
  resultId: string;
  result: SellerSafeResult;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Existing result for a server-derived idempotency key, if still live. Returns
 * null while an evaluation is merely reserved — a pending reservation is not a
 * result and must not be rendered as one.
 */
export async function findByIdempotencyKey(
  idempotencyKey: string,
  sid: string,
): Promise<StoredResult | null> {
  const found = await getPreviewStore().findByKey(idempotencyKey, sid);
  if (found.state !== 'ready' || !found.resultId || !found.result) return null;
  return { resultId: found.resultId, result: found.result };
}

export async function readResult(resultId: string, sid: string): Promise<ReadOutcome> {
  return getPreviewStore().readResult(resultId, sid);
}

export type EvaluationWork = () => Promise<{ result: SellerSafeResult; cacheable: boolean }>;

/**
 * Run `work` exactly once per idempotency key across every instance.
 *
 * The winner evaluates and publishes. Losers wait for the published result. If
 * the work produces a non-cacheable (retryable) outcome the reservation is
 * released, so an immediate retry genuinely re-evaluates.
 */
export async function runOnceForKey(
  idempotencyKey: string,
  sid: string,
  newResultId: () => string,
  work: EvaluationWork,
): Promise<StoredResult> {
  const store = getPreviewStore();
  const candidateId = newResultId();

  const reservation = await store.reserve(
    idempotencyKey,
    sid,
    candidateId,
    RESULT_TTL_MS,
    RESERVATION_LEASE_MS,
  );

  // ── We lost the race: wait for the winner rather than evaluating again ────
  if (reservation.state === 'ready' && reservation.resultId && reservation.result) {
    return { resultId: reservation.resultId, result: reservation.result };
  }

  if (reservation.state === 'pending') {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(WAIT_POLL_MS);
      const current = await store.findByKey(idempotencyKey, sid);
      if (current.state === 'ready' && current.resultId && current.result) {
        return { resultId: current.resultId, result: current.result };
      }
      // The winner released a retryable failure; stop waiting and report it.
      if (current.state === 'gone') break;
    }
    // The winner never published. Surface a transient failure rather than
    // starting a duplicate evaluation behind its back.
    throw new StoreUnavailableError('reservation did not resolve');
  }

  if (reservation.state === 'gone') {
    // The key expired or belongs to another session. Treat as transient.
    throw new StoreUnavailableError('reservation unavailable');
  }

  // ── We won: evaluate, then publish or release ────────────────────────────
  try {
    const { result, cacheable } = await work();

    if (!cacheable) {
      await store.release(idempotencyKey);
      return { resultId: candidateId, result };
    }

    await store.complete(idempotencyKey, candidateId, result, RESULT_TTL_MS);
    return { resultId: candidateId, result };
  } catch (error) {
    // Never leave a reservation behind on an unexpected fault; the next attempt
    // must be able to proceed immediately.
    await store.release(idempotencyKey).catch(() => {});
    throw error;
  }
}
