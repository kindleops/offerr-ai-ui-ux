/**
 * Privacy-conscious funnel analytics (client side).
 *
 * WHAT IS ALLOWED TO LEAVE THE BROWSER
 *   - which step was reached, and when
 *   - the OUTCOME CATEGORY (one of the seller-safe enum values)
 *   - retry and abandonment counters
 *
 * WHAT IS NEVER SENT
 *   - the address, or any part of it (not even the ZIP)
 *   - any seller fact, condition, timeline, asking price
 *   - contact details of any kind
 *   - the monetary range, its bounds, or anything derived from them
 *   - internal reason codes, support codes, result ids, session ids
 *
 * The payload type below is a closed shape on purpose: adding a field means
 * editing this file, which is where the review question "should this leave the
 * browser?" gets asked.
 */

export type JourneyEvent =
  | 'journey_viewed'
  | 'address_started'
  | 'property_step_completed'
  | 'context_step_completed'
  | 'situation_step_completed'
  | 'contact_step_completed'
  | 'review_submitted'
  | 'evaluation_started'
  | 'evaluation_outcome'
  | 'evaluation_retry'
  | 'journey_abandoned';

export interface JourneyEventPayload {
  /** Seller-safe outcome category only. Never a range, never a reason code. */
  outcome?: string;
  /** Step key for abandonment attribution. */
  step?: string;
  /** Monotonic counters. */
  attempt?: number;
  /** Coarse duration bucket in seconds, not a precise timing fingerprint. */
  elapsedBucket?: '0-15s' | '15-60s' | '1-3m' | '3m+';
}

export function elapsedBucket(ms: number): NonNullable<JourneyEventPayload['elapsedBucket']> {
  const s = ms / 1000;
  if (s < 15) return '0-15s';
  if (s < 60) return '15-60s';
  if (s < 180) return '1-3m';
  return '3m+';
}

type Sink = (event: JourneyEvent, payload: JourneyEventPayload) => void;

let sink: Sink | null = null;

/**
 * Register the analytics destination. Left unset by default: the closed preview
 * ships with NO third-party analytics wired, so nothing is transmitted at all
 * until someone deliberately connects a sink and reviews this contract.
 */
export function setAnalyticsSink(next: Sink | null) {
  sink = next;
}

export function track(event: JourneyEvent, payload: JourneyEventPayload = {}) {
  // Defensive: strip anything not in the allowlisted shape, even if a caller
  // passes extra keys.
  const safe: JourneyEventPayload = {};
  if (typeof payload.outcome === 'string') safe.outcome = payload.outcome;
  if (typeof payload.step === 'string') safe.step = payload.step;
  if (typeof payload.attempt === 'number') safe.attempt = payload.attempt;
  if (payload.elapsedBucket) safe.elapsedBucket = payload.elapsedBucket;

  try {
    sink?.(event, safe);
  } catch {
    // Analytics must never break the journey.
  }
}
