/**
 * The seller-facts contract, mirrored from the evaluation spine.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The real-preview integration surfaced a material mismatch: the OfferrAI form
 * model and the spine's accepted `seller_facts` are different vocabularies, and
 * nothing in this repository knew that. A field whose NAME looked compatible was
 * forwarded, the spine rejected the WHOLE submission with
 * `seller_facts_unknown_key:<key>`, and the seller was shown a retryable
 * "unavailable" for a submission that would be rejected identically forever.
 *
 * The spine validates FAIL-CLOSED on unknown keys. That makes the outbound
 * payload an exact-match contract, not a best-effort overlay: one extra key
 * fails the entire evaluation. So the contract is restated here, in source
 * control, and asserted before the network hop.
 *
 * SOURCE OF TRUTH
 * ---------------
 * rei-automation: apps/api/src/lib/domain/offerr/offerr-contracts.js
 *   SELLER_FACT_KEYS, CONDITION_VALUES, OCCUPANCY_VALUES, REPAIR_LEVELS,
 *   TIMELINE_VALUES, OFFERR_INTAKE_LIMITS.repairs_notes_max_length
 *
 * This is a MIRROR, not an import — the two repositories deploy independently
 * and there is no shared package. A mirror can drift, so the drift is made loud:
 * `assertSellerFactsAccepted()` runs on every outbound payload and the contract
 * tests enumerate every valid UI combination. A backend enum change turns into a
 * failing test here rather than a seller-facing outage.
 *
 * NOT server-only on purpose: these are enum values, not secrets, and the intake
 * form derives its own validation from them so the browser and the spine cannot
 * disagree about what a seller is allowed to say.
 */

/** The ONLY five keys the spine accepts. Anything else fails the submission. */
export const BACKEND_SELLER_FACT_KEYS = [
  'condition',
  'occupancy',
  'repairs',
  'timeline',
  'asking_price',
] as const;

export const BACKEND_CONDITION_VALUES = ['excellent', 'good', 'fair', 'poor'] as const;

/**
 * The spine also accepts `unknown`. The form deliberately does NOT offer it —
 * an occupancy the seller did not state is an OMITTED key, not a claim that the
 * occupancy is unknown. See `UI_OCCUPANCY_VALUES`.
 */
export const BACKEND_OCCUPANCY_VALUES = [
  'owner_occupied',
  'tenant_occupied',
  'vacant',
  'unknown',
] as const;

export const BACKEND_REPAIR_LEVELS = ['none', 'cosmetic', 'moderate', 'major'] as const;

export const BACKEND_TIMELINE_VALUES = [
  'asap',
  '30_days',
  '60_days',
  '90_days_plus',
  'exploring',
] as const;

/** Spine bound. The form's own bound is stricter; see `UI_REPAIRS_NOTES_MAX`. */
export const BACKEND_REPAIRS_NOTES_MAX = 500;

/** The subset of occupancy values the seller may actually choose. */
export const UI_OCCUPANCY_VALUES = ['owner_occupied', 'tenant_occupied', 'vacant'] as const;

/**
 * Deliberately below the spine's 500. Rejecting at the form is a correctable
 * seller-facing message; rejecting at the spine is a failed evaluation.
 */
export const UI_REPAIRS_NOTES_MAX = 400;

export type BackendConditionValue = (typeof BACKEND_CONDITION_VALUES)[number];
export type BackendOccupancyValue = (typeof BACKEND_OCCUPANCY_VALUES)[number];
export type BackendRepairLevel = (typeof BACKEND_REPAIR_LEVELS)[number];
export type BackendTimelineValue = (typeof BACKEND_TIMELINE_VALUES)[number];

/** The exact shape permitted on the wire. */
export interface OutboundSellerFacts {
  condition?: BackendConditionValue;
  occupancy?: BackendOccupancyValue;
  repairs?: { level: BackendRepairLevel; notes?: string };
  timeline?: BackendTimelineValue;
  asking_price?: number;
}

export interface ContractCheck {
  ok: boolean;
  /**
   * Spine error vocabulary, reproduced verbatim so a local rejection and a
   * remote one are describable in the same terms in logs and tests.
   */
  errors: string[];
}

const KEYS = new Set<string>(BACKEND_SELLER_FACT_KEYS);
const CONDITIONS = new Set<string>(BACKEND_CONDITION_VALUES);
const OCCUPANCIES = new Set<string>(BACKEND_OCCUPANCY_VALUES);
const LEVELS = new Set<string>(BACKEND_REPAIR_LEVELS);
const TIMELINES = new Set<string>(BACKEND_TIMELINE_VALUES);

/**
 * Validate an outbound payload against the mirrored contract.
 *
 * This reproduces the spine's `normalizeSellerFacts` acceptance rules — key
 * allowlist, enum membership, repairs shape, notes bound, numeric asking price —
 * so a contract break is caught BEFORE the request is made. A local rejection
 * costs nothing; a remote one costs the seller their submission.
 */
export function assertSellerFactsAccepted(facts: unknown): ContractCheck {
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) {
    return { ok: false, errors: ['seller_facts_must_be_object'] };
  }

  const errors: string[] = [];
  const record = facts as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    // The failure that started all of this. An unknown key does not degrade the
    // evaluation, it fails the whole submission.
    if (!KEYS.has(key)) errors.push(`seller_facts_unknown_key:${key}`);
  }

  if (record.condition !== undefined && !CONDITIONS.has(String(record.condition))) {
    errors.push('seller_facts_invalid_condition');
  }

  if (record.occupancy !== undefined && !OCCUPANCIES.has(String(record.occupancy))) {
    errors.push('seller_facts_invalid_occupancy');
  }

  if (record.timeline !== undefined && !TIMELINES.has(String(record.timeline))) {
    errors.push('seller_facts_invalid_timeline');
  }

  if (record.repairs !== undefined) {
    const repairs = record.repairs;
    const isObject = typeof repairs === 'object' && repairs !== null && !Array.isArray(repairs);
    const level = String(
      (isObject ? (repairs as { level?: unknown }).level : repairs) ?? '',
    ).toLowerCase();
    const notes = String((isObject ? (repairs as { notes?: unknown }).notes : '') ?? '');

    if (!LEVELS.has(level)) {
      errors.push('seller_facts_invalid_repairs_level');
    } else if (notes.length > BACKEND_REPAIRS_NOTES_MAX) {
      errors.push('seller_facts_repairs_notes_too_long');
    }
  }

  if (record.asking_price !== undefined) {
    const value = record.asking_price;
    const parsed = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
    if (!Number.isFinite(parsed) || parsed < 0) errors.push('seller_facts_invalid_asking_price');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Fields the seller answers that are deliberately NOT forwarded, with the reason.
 *
 * Documented as data rather than prose so a test can assert the list is complete
 * and that none of them ever appears on the wire. "The spine has no contract for
 * it" is the only acceptable reason to collect an answer and not send it — any
 * other reason means the question should not be asked.
 */
export const INTENTIONALLY_UNFORWARDED_UI_FIELDS: Readonly<Record<string, string>> = Object.freeze({
  propertyType: 'No spine contract. Property type is resolved from the address server-side.',
  bedrooms: 'No spine contract. Resolved from the property record, not the seller claim.',
  bathrooms: 'No spine contract. Resolved from the property record, not the seller claim.',
  units: 'No spine contract. Resolved from the property record, not the seller claim.',
  majorUpdates: 'No spine contract. Captured for the operator review summary only.',
  reason: 'No spine contract, and motivation must not influence a preliminary range.',
  isListed: 'No spine contract. An operator qualification signal, not an underwriting input.',
  decisionMaker: 'No spine contract. An operator qualification signal, not an underwriting input.',
  knownDamage: 'Forwarded, but only as `repairs.notes` — never as a top-level key.',
  firstName: 'Contact detail. Never forwarded; the evaluation does not use it.',
  email: 'Contact detail. Never forwarded; the evaluation does not use it.',
  phone: 'Contact detail. Never forwarded; the evaluation does not use it.',
  companyWebsite: 'Honeypot. Presence discards the submission before any hop.',
});
