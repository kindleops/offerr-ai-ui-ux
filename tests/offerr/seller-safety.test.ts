/**
 * Offerr closed-preview — seller-safety and boundary regressions.
 *
 * Run with:
 *   node --conditions=react-server --test tests/offerr/*.test.ts
 *
 * `--conditions=react-server` makes the `server-only` marker resolve to its
 * empty build, which is what lets these server modules be exercised under the
 * plain Node test runner.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FORBIDDEN_CLAIM_PATTERNS,
  NON_BINDING_DISCLAIMER,
  RANGE_OUTCOMES,
  SELLER_OUTCOMES,
  failureToSellerSafe,
  toSellerSafeResult,
  type SellerSafeResult,
} from '../../lib/offerr/outcomes.ts';
import {
  composeAddress,
  intakeSubmissionSchema,
  toSellerFacts,
} from '../../lib/offerr/intake-schema.ts';

/* ── Outcome mapping ───────────────────────────────────────────────────────── */

const VALID_SUBMISSION = {
  property: { address: '6310 Cambridge Glen Ln, Houston, TX 77035', unit: '' },
  context: {
    propertyType: 'single_family',
    occupancy: 'owner_occupied',
    condition: 'good',
    repairLevel: 'cosmetic',
  },
  situation: { timeline: 'within_30_days', isListed: false, decisionMaker: 'yes' },
  consent: { evaluationConsent: true },
};

const ALL_OUTCOMES = Object.values(SELLER_OUTCOMES);

function everyOutcomeSample(): SellerSafeResult[] {
  return [
    toSellerSafeResult({
      ok: true,
      outcome: 'INSTANT_RANGE_ELIGIBLE',
      projection: { preliminary_range: { low: 200000, high: 240000 }, expires_at: new Date().toISOString() },
      supportCode: 'ABC12345',
    }),
    toSellerSafeResult({
      ok: true,
      outcome: 'CONDITIONAL_RANGE',
      projection: { preliminary_range: { low: 180000, high: 260000 } },
    }),
    toSellerSafeResult({ ok: true, outcome: 'REVIEW_REQUIRED' }),
    toSellerSafeResult({
      ok: true,
      outcome: 'REVIEW_REQUIRED',
      projection: { next_step: 'confirm_property_address' },
    }),
    toSellerSafeResult({ ok: true, outcome: 'NOT_ELIGIBLE' }),
    failureToSellerSafe('property_not_found', null),
    failureToSellerSafe('insufficient_data', null),
    failureToSellerSafe('evaluation_timeout', null),
    failureToSellerSafe('invalid_offerr_intake', null),
  ];
}

test('every documented outcome maps to a designed seller-facing state', () => {
  const produced = new Set(everyOutcomeSample().map((r) => r.outcome));
  for (const outcome of [
    SELLER_OUTCOMES.PRELIMINARY_RANGE,
    SELLER_OUTCOMES.CONDITIONAL_RANGE,
    SELLER_OUTCOMES.MANUAL_REVIEW,
    SELLER_OUTCOMES.CONFIRM_PROPERTY,
    SELLER_OUTCOMES.UNSUPPORTED_PROPERTY,
    SELLER_OUTCOMES.PROPERTY_NOT_FOUND,
    SELLER_OUTCOMES.INSUFFICIENT_DATA,
    SELLER_OUTCOMES.UNAVAILABLE_RETRYABLE,
  ]) {
    assert.ok(produced.has(outcome), `${outcome} is never produced by the mapper`);
  }
});

test('no seller-facing copy contains a binding or guarantee claim', () => {
  for (const result of everyOutcomeSample()) {
    const copy = [result.headline, result.body, result.detail, result.nextStep, ...result.assumptions]
      .filter(Boolean)
      .join(' ');
    for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
      assert.ok(
        !pattern.test(copy),
        `${result.outcome} copy matches forbidden claim ${pattern}: ${copy}`,
      );
    }
  }
});

test('every outcome carries the non-binding disclaimer and binding=false', () => {
  for (const result of everyOutcomeSample()) {
    assert.equal(result.binding, false, `${result.outcome} must never be binding`);
    assert.equal(result.disclaimer, NON_BINDING_DISCLAIMER, `${result.outcome} lost its disclaimer`);
  }
});

test('only range outcomes carry a range, and a range outcome without one degrades safely', () => {
  for (const result of everyOutcomeSample()) {
    if (!RANGE_OUTCOMES.includes(result.outcome)) {
      assert.equal(result.range, null, `${result.outcome} must not carry a monetary range`);
    }
  }
  // "Range eligible" with no usable range must NOT render an empty band.
  const degraded = toSellerSafeResult({ ok: true, outcome: 'INSTANT_RANGE_ELIGIBLE', projection: null });
  assert.equal(degraded.outcome, SELLER_OUTCOMES.MANUAL_REVIEW);
  assert.equal(degraded.range, null);

  // An inverted or non-numeric range is rejected rather than displayed.
  const inverted = toSellerSafeResult({
    ok: true,
    outcome: 'INSTANT_RANGE_ELIGIBLE',
    projection: { preliminary_range: { low: 500000, high: 100000 } },
  });
  assert.equal(inverted.outcome, SELLER_OUTCOMES.MANUAL_REVIEW);
});

test('an identity problem wins over any range the engine also attached', () => {
  const result = toSellerSafeResult({
    ok: true,
    outcome: 'INSTANT_RANGE_ELIGIBLE',
    projection: {
      next_step: 'confirm_property_address',
      preliminary_range: { low: 200000, high: 250000 },
    },
  });
  assert.equal(result.outcome, SELLER_OUTCOMES.CONFIRM_PROPERTY);
  assert.equal(result.range, null, 'a range must never be shown for an unconfirmed property');
});

test('an unrecognised internal outcome degrades to manual review, never to a range', () => {
  const result = toSellerSafeResult({ ok: true, outcome: 'SOME_FUTURE_STATE' });
  assert.equal(result.outcome, SELLER_OUTCOMES.MANUAL_REVIEW);
  assert.equal(result.range, null);
});

test('an unrecognised failure code degrades to a retryable unavailability', () => {
  const result = failureToSellerSafe('something_new_and_unmapped', null);
  assert.equal(result.outcome, SELLER_OUTCOMES.UNAVAILABLE_RETRYABLE);
  assert.equal(result.retryable, true);
});

/* ── Leakage ───────────────────────────────────────────────────────────────── */

test('no internal reason code or private candidate detail reaches the seller payload', () => {
  const leaky = toSellerSafeResult({
    ok: true,
    outcome: 'CONDITIONAL_RANGE',
    projection: {
      preliminary_range: { low: 100000, high: 150000 },
      // Fields an internal payload might carry. None are in the allowlist.
      ...({
        reason: 'geography_conflict:zip',
        candidates: [{ property_id: 'p-1', property_address_full: '900 Private Rd' }],
        mao: 123456,
        assignment_fee: 9000,
        buyer_names: ['Acme Capital'],
        risk_score: 0.82,
        request_id: 'req-internal-1',
        diagnostics: { candidate_count: 26 },
      } as Record<string, unknown>),
    } as never,
  });

  const serialized = JSON.stringify(leaky);
  for (const forbidden of [
    'geography_conflict',
    'candidate_set',
    'property_id',
    'p-1',
    '900 Private Rd',
    'mao',
    'assignment_fee',
    'Acme Capital',
    'risk_score',
    'req-internal-1',
    'diagnostics',
  ]) {
    assert.ok(!serialized.includes(forbidden), `seller payload leaked "${forbidden}"`);
  }
});

test('the seller result shape is a closed allowlist', () => {
  const result = toSellerSafeResult({
    ok: true,
    outcome: 'INSTANT_RANGE_ELIGIBLE',
    projection: { preliminary_range: { low: 200000, high: 240000 } },
  });
  assert.deepEqual(
    Object.keys(result).sort(),
    [
      'assumptions', 'binding', 'body', 'confidence', 'detail', 'disclaimer',
      'expiresAt', 'headline', 'nextStep', 'outcome', 'range', 'retryable', 'supportCode',
    ].sort(),
  );
});

/* ── Intake validation ─────────────────────────────────────────────────────── */

test('a valid submission parses and a property identifier is never accepted', () => {
  const parsed = intakeSubmissionSchema.safeParse({
    ...VALID_SUBMISSION,
    // A caller trying to aim the evaluation at an arbitrary record.
    property: { ...VALID_SUBMISSION.property, property_id: 'p-attacker', property_export_id: 'x-1' },
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal('property_id' in parsed.data.property, false, 'property_id must be stripped');
    assert.equal('property_export_id' in parsed.data.property, false);
  }
});

test('consent is mandatory', () => {
  const parsed = intakeSubmissionSchema.safeParse({
    ...VALID_SUBMISSION,
    consent: { evaluationConsent: false },
  });
  assert.equal(parsed.success, false);
});

test('an over-long address is rejected before any upstream call', () => {
  const parsed = intakeSubmissionSchema.safeParse({
    ...VALID_SUBMISSION,
    property: { address: 'x'.repeat(400), unit: '' },
  });
  assert.equal(parsed.success, false);
});

test('contact details are never forwarded to the evaluation service', () => {
  const parsed = intakeSubmissionSchema.parse({
    ...VALID_SUBMISSION,
    contact: { firstName: 'Jane', email: 'jane@example.com', phone: '555-0100' },
  });
  const facts = JSON.stringify(toSellerFacts(parsed));
  for (const pii of ['Jane', 'jane@example.com', '555-0100']) {
    assert.ok(!facts.includes(pii), `seller facts leaked contact detail "${pii}"`);
  }
});

test('every seller fact is tagged as an unverified claim', () => {
  const parsed = intakeSubmissionSchema.parse(VALID_SUBMISSION);
  for (const [key, value] of Object.entries(toSellerFacts(parsed))) {
    assert.equal(
      (value as { source?: string }).source,
      'seller_claim',
      `${key} is not marked as a seller claim`,
    );
  }
});

test('"prefer not to say" is not forwarded upstream', () => {
  const parsed = intakeSubmissionSchema.parse({
    ...VALID_SUBMISSION,
    situation: { ...VALID_SUBMISSION.situation, reason: 'prefer_not_to_say' },
  });
  assert.equal('reason' in toSellerFacts(parsed), false);
});

test('a unit is folded into the address in a form the internal parser understands', () => {
  assert.equal(
    composeAddress({ address: '500 Main St, Dallas, TX 75201', unit: '4B' }),
    '500 Main St Unit 4B, Dallas, TX 75201',
  );
  assert.equal(
    composeAddress({ address: '500 Main St, Dallas, TX 75201', unit: '' }),
    '500 Main St, Dallas, TX 75201',
  );
});
