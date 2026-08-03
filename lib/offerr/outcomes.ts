/**
 * Seller-facing outcome contract.
 *
 * This is the ONLY place an internal evaluation result becomes something a
 * browser may see. It is an ALLOWLIST, not a redaction pass: the seller-safe
 * projection is constructed field by field from known-safe values, so a new
 * internal field cannot leak by being forgotten. Anything not named here does
 * not cross the boundary.
 *
 * NEVER CROSSES THIS BOUNDARY
 *   - comp selection, comp rows, comp counts
 *   - MAO, assignment fee, margins, buyer names, buyer demand
 *   - internal risk scores, suppression state, acquisition execution state
 *   - internal reason codes (`geography_conflict:zip`, `candidate_set_...`)
 *   - candidate addresses or any other property record
 *   - request ids, database ids, correlation internals beyond a support code
 *
 * LANGUAGE RULES
 *   Never "guaranteed", "approved", "final offer", "cash committed",
 *   "contract ready". Every range is preliminary, non-binding and expiring.
 */

export const SELLER_OUTCOMES = {
  PRELIMINARY_RANGE: 'preliminary_range',
  CONDITIONAL_RANGE: 'conditional_range',
  MANUAL_REVIEW: 'manual_review',
  CONFIRM_PROPERTY: 'confirm_property',
  PROPERTY_NOT_FOUND: 'property_not_found',
  UNSUPPORTED_PROPERTY: 'unsupported_property',
  INSUFFICIENT_DATA: 'insufficient_data',
  UNAVAILABLE_RETRYABLE: 'unavailable_retryable',
} as const;

export type SellerOutcome = (typeof SELLER_OUTCOMES)[keyof typeof SELLER_OUTCOMES];

export interface SellerSafeRange {
  low: number;
  high: number;
  currency: 'USD';
}

export interface SellerSafeResult {
  outcome: SellerOutcome;
  /** Present only for range outcomes. */
  range: SellerSafeRange | null;
  /** Plain-language confidence. Never a numeric internal score. */
  confidence: 'indicative' | 'needs_confirmation' | null;
  headline: string;
  body: string;
  /** Neutral, seller-facing. Never an internal reason code. */
  detail: string | null;
  assumptions: string[];
  nextStep: string;
  /** ISO timestamp. Always present for a range; a range never reads as durable. */
  expiresAt: string | null;
  binding: false;
  disclaimer: string;
  /** Whether the UI should offer a retry for this outcome. */
  retryable: boolean;
  /** Short opaque code a seller can quote to support. Not an identifier we act on. */
  supportCode: string | null;
}

export const NON_BINDING_DISCLAIMER =
  'This is a preliminary estimate based on available data and the details you provided. ' +
  'It is not an offer, not a commitment to purchase, and not a valuation or appraisal. ' +
  'Any actual offer would follow verification of the property and its condition.';

/**
 * Every outcome carries the disclaimer. Making it part of the constructor
 * rather than a template concern means a new result state cannot ship without
 * it — a missing disclaimer would be a compliance defect, not a copy bug.
 */
function result(partial: Omit<SellerSafeResult, 'binding' | 'disclaimer'>): SellerSafeResult {
  return { ...partial, binding: false, disclaimer: NON_BINDING_DISCLAIMER };
}

const RANGE_ASSUMPTIONS = [
  'Assumes the property is in the condition described.',
  'Subject to a walkthrough and confirmation of the details you provided.',
  'Reflects recent activity for comparable properties in the area.',
];

/**
 * Internal outcome codes we expect from the evaluation spine. Anything not
 * listed maps to manual review — an unrecognised internal state must never be
 * optimistically rendered as a range.
 */
const INTERNAL_OUTCOME_MAP: Record<string, SellerOutcome> = {
  INSTANT_RANGE_ELIGIBLE: SELLER_OUTCOMES.PRELIMINARY_RANGE,
  instant_range_eligible: SELLER_OUTCOMES.PRELIMINARY_RANGE,
  CONDITIONAL_RANGE: SELLER_OUTCOMES.CONDITIONAL_RANGE,
  conditional_range: SELLER_OUTCOMES.CONDITIONAL_RANGE,
  REVIEW_REQUIRED: SELLER_OUTCOMES.MANUAL_REVIEW,
  review_required: SELLER_OUTCOMES.MANUAL_REVIEW,
  MANUAL_REVIEW: SELLER_OUTCOMES.MANUAL_REVIEW,
  NOT_ELIGIBLE: SELLER_OUTCOMES.UNSUPPORTED_PROPERTY,
  not_eligible: SELLER_OUTCOMES.UNSUPPORTED_PROPERTY,
  UNSUPPORTED: SELLER_OUTCOMES.UNSUPPORTED_PROPERTY,
};

/**
 * `next_step` hints from the spine's seller projection. These are the only
 * internal strings allowed to influence branching, and they are matched
 * exactly — never interpolated into copy.
 */
const NEXT_STEP_MAP: Record<string, SellerOutcome> = {
  confirm_property_address: SELLER_OUTCOMES.CONFIRM_PROPERTY,
  confirm_unit: SELLER_OUTCOMES.CONFIRM_PROPERTY,
};

export interface InternalEvaluationView {
  ok: boolean;
  outcome?: string | null;
  failureCode?: string | null;
  /** Seller projection from the internal spine (already seller-scoped upstream). */
  projection?: {
    preliminary_range?: { low?: number; high?: number } | null;
    next_step?: string | null;
    expires_at?: string | null;
    confidence?: string | null;
  } | null;
  /** Short support code minted by the boundary. Never an internal request id. */
  supportCode?: string | null;
  /**
   * When the upstream response failed the runtime contract, the offending key
   * NAME (never its value). Server-side diagnostics only — it is never carried
   * into any seller-facing field.
   */
  contractField?: string | null;
}

function sanitizeRange(range: unknown): SellerSafeRange | null {
  if (!range || typeof range !== 'object') return null;
  const low = Number((range as { low?: unknown }).low);
  const high = Number((range as { high?: unknown }).high);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (low <= 0 || high <= 0 || high < low) return null;
  // Round to whole dollars. A range presented to the cent implies a precision
  // a preliminary estimate does not have.
  return { low: Math.round(low), high: Math.round(high), currency: 'USD' };
}

/**
 * Map an internal evaluation to exactly one seller-facing state.
 *
 * Ordering is deliberate: failures and identity problems are resolved BEFORE
 * any range is considered, so a partially-populated failure response can never
 * be rendered as a successful estimate.
 */
export function toSellerSafeResult(view: InternalEvaluationView): SellerSafeResult {
  const supportCode = view.supportCode ?? null;

  if (!view.ok) {
    return failureToSellerSafe(view.failureCode ?? null, supportCode);
  }

  const projection = view.projection ?? null;
  const nextStepHint = String(projection?.next_step ?? '');

  // Identity problems win over any range the engine may also have attached.
  const identityOutcome = NEXT_STEP_MAP[nextStepHint];
  if (identityOutcome === SELLER_OUTCOMES.CONFIRM_PROPERTY) {
    return result({
      outcome: SELLER_OUTCOMES.CONFIRM_PROPERTY,
      range: null,
      confidence: null,
      headline: 'We need to confirm the property',
      body:
        'We could not confirm exactly which property this is. That usually means the address ' +
        'matches more than one record, or a unit number is missing.',
      detail: 'Check the address and add a unit or apartment number if the property has one.',
      assumptions: [],
      nextStep: 'Review the address and submit again.',
      expiresAt: null,
      retryable: true,
      supportCode,
    });
  }

  const mapped = INTERNAL_OUTCOME_MAP[String(view.outcome ?? '')] ?? SELLER_OUTCOMES.MANUAL_REVIEW;
  const range = sanitizeRange(projection?.preliminary_range);

  if (mapped === SELLER_OUTCOMES.PRELIMINARY_RANGE) {
    // A "range eligible" outcome with no usable range is an internal
    // inconsistency. Fail to manual review rather than render an empty band.
    if (!range) return manualReview(supportCode);
    return result({
      outcome: SELLER_OUTCOMES.PRELIMINARY_RANGE,
      range,
      confidence: 'indicative',
      headline: 'Your preliminary range',
      body:
        'Based on the information available for your property and what you told us, this is the ' +
        'range we would expect to work within.',
      detail: null,
      assumptions: RANGE_ASSUMPTIONS,
      nextStep: 'A member of our team will follow up to confirm the details.',
      expiresAt: projection?.expires_at ?? null,
      retryable: false,
      supportCode,
    });
  }

  if (mapped === SELLER_OUTCOMES.CONDITIONAL_RANGE) {
    if (!range) return manualReview(supportCode);
    return result({
      outcome: SELLER_OUTCOMES.CONDITIONAL_RANGE,
      range,
      confidence: 'needs_confirmation',
      headline: 'Your preliminary range, pending confirmation',
      body:
        'We can share an initial range, but some details still need confirming before it can be ' +
        'narrowed.',
      // Neutral and non-specific by design: the internal reason (a seller-fact
      // conflict, an asking-price conflict, thin comp evidence) is not
      // something the seller should be shown or could act on precisely.
      detail: 'Confirming the condition and recent updates will let us tighten this range.',
      assumptions: RANGE_ASSUMPTIONS,
      nextStep: 'A member of our team will follow up to confirm the details.',
      expiresAt: projection?.expires_at ?? null,
      retryable: false,
      supportCode,
    });
  }

  if (mapped === SELLER_OUTCOMES.UNSUPPORTED_PROPERTY) return unsupported(supportCode);

  return manualReview(supportCode);
}

function manualReview(supportCode: string | null): SellerSafeResult {
  return result({
    outcome: SELLER_OUTCOMES.MANUAL_REVIEW,
    range: null,
    confidence: null,
    headline: 'We have your details',
    body:
      'This property needs a person to look at it rather than an automatic estimate. That is ' +
      'common and it is not a rejection.',
    detail: null,
    assumptions: [],
    // No response time is promised: nothing operationally supports one yet.
    nextStep: 'Someone from our team will review it and get in touch.',
    expiresAt: null,
    retryable: false,
    supportCode,
  });
}

function unsupported(supportCode: string | null): SellerSafeResult {
  return result({
    outcome: SELLER_OUTCOMES.UNSUPPORTED_PROPERTY,
    range: null,
    confidence: null,
    headline: 'We cannot estimate this one automatically',
    body:
      'Our current programme does not automatically evaluate this type of property. That is a ' +
      'limit of what we can price instantly — it says nothing about the property itself.',
    detail: null,
    assumptions: [],
    nextStep: 'If you would like a person to look at it, our team can still review it.',
    expiresAt: null,
    retryable: false,
    supportCode,
  });
}

/**
 * Internal failure codes → seller-safe states. Anything unrecognised becomes a
 * generic retryable unavailability: an unknown failure must never be described
 * to a seller in terms we have not vetted.
 */
export function failureToSellerSafe(
  failureCode: string | null,
  supportCode: string | null,
): SellerSafeResult {
  switch (failureCode) {
    case 'invalid_offerr_intake':
      return result({
        outcome: SELLER_OUTCOMES.CONFIRM_PROPERTY,
        range: null,
        confidence: null,
        headline: 'We need to confirm the property',
        body: 'We could not read that address well enough to look it up.',
        detail: 'Check the street number and street name, then try again.',
        assumptions: [],
        nextStep: 'Review the address and submit again.',
        expiresAt: null,
        retryable: true,
        supportCode,
      });

    case 'property_not_found':
      return result({
        outcome: SELLER_OUTCOMES.PROPERTY_NOT_FOUND,
        range: null,
        confidence: null,
        headline: 'We could not find that property',
        body: 'We could not match that address to a property record we hold.',
        detail: 'Check the address, or add a unit number if the property has one.',
        assumptions: [],
        nextStep: 'Review the address and submit again.',
        expiresAt: null,
        retryable: true,
        supportCode,
      });

    case 'insufficient_data':
      return result({
        outcome: SELLER_OUTCOMES.INSUFFICIENT_DATA,
        range: null,
        confidence: null,
        headline: 'Not enough information to estimate',
        body:
          'We do not hold enough recent information about this property or its area to produce a ' +
          'reliable range.',
        detail: null,
        assumptions: [],
        nextStep: 'Our team can review it manually if you would like.',
        expiresAt: null,
        retryable: false,
        supportCode,
      });

    // A backend that returned privileged fields is a regression on our side of
    // the fence. The seller sees the same neutral unavailability as any other
    // internal fault — never that a contract check rejected the response.
    case 'upstream_contract_violation':
    case 'evaluation_timeout':
    case 'offerr_persistence_unavailable':
    case 'offerr_persistence_failed':
    case 'offerr_idempotency_conflict_retry':
    case 'offerr_incomplete_snapshot':
    case 'subject_hydration_error':
    case 'property_resolution_error':
    case 'comp_load_error':
    case 'offerr_disabled':
    case 'upstream_unavailable':
    default:
      return result({
        outcome: SELLER_OUTCOMES.UNAVAILABLE_RETRYABLE,
        range: null,
        confidence: null,
        headline: 'We could not complete that just now',
        body: 'Something on our side did not finish. Your details were not lost.',
        detail: null,
        assumptions: [],
        nextStep: 'Try again in a moment.',
        expiresAt: null,
        retryable: true,
        supportCode,
      });
  }
}

/** Outcomes that legitimately carry a monetary range. Used by tests and the UI. */
export const RANGE_OUTCOMES: SellerOutcome[] = [
  SELLER_OUTCOMES.PRELIMINARY_RANGE,
  SELLER_OUTCOMES.CONDITIONAL_RANGE,
];

/**
 * Words that must never appear in seller-facing copy. Asserted by tests across
 * every outcome so a future copy edit cannot introduce a binding claim.
 */
export const FORBIDDEN_CLAIM_PATTERNS: RegExp[] = [
  /\bguarantee(d|s)?\b/i,
  /\bapproved\b/i,
  /\bfinal offer\b/i,
  /\bcash committed\b/i,
  /\bcontract ready\b/i,
  /\bwe will buy\b/i,
  /\bcertified\b/i,
];
