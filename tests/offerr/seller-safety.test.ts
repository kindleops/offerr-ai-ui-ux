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
  toFingerprintFacts,
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
  situation: { timeline: '30_days', isListed: false, decisionMaker: 'yes' },
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

test('only the spine\'s five contract keys are forwarded', () => {
  const parsed = intakeSubmissionSchema.parse(VALID_SUBMISSION);
  const facts = toSellerFacts(parsed);
  const allowed = ['condition', 'occupancy', 'repairs', 'timeline', 'asking_price'];
  for (const key of Object.keys(facts)) {
    assert.ok(allowed.includes(key), `"${key}" is not in the spine's seller-facts contract`);
  }
  // The spine validates fail-closed on unknown keys, so an extra field does not
  // enrich the evaluation — it rejects the entire submission.
  assert.ok(!('property_type' in facts));
  assert.ok(!('bedrooms' in facts));
  assert.ok(!('is_listed' in facts));
  assert.ok(!('decision_maker' in facts));
});

test('seller facts are raw values, not double-wrapped claim envelopes', () => {
  const parsed = intakeSubmissionSchema.parse(VALID_SUBMISSION);
  const facts = toSellerFacts(parsed) as Record<string, unknown>;
  // The spine wraps each value itself ({ source: 'seller_claimed', verified:
  // false, received_at }). Wrapping here produced a double envelope it could
  // not read, and every submission was rejected as invalid intake.
  assert.equal(typeof facts.condition, 'string');
  assert.equal(typeof facts.timeline, 'string');
  assert.equal((facts.repairs as { level?: string })?.level, parsed.context.repairLevel);
  assert.ok(!('value' in (facts as { value?: unknown })));
});

test('the timeline vocabulary matches the spine exactly, with no translation', () => {
  // A translated vocabulary let a seller's answer arrive meaning something
  // subtly different ('within 90 days' is not '90 days or more').
  const canonical = ['asap', '30_days', '60_days', '90_days_plus', 'exploring'];
  for (const timeline of canonical) {
    const parsed = intakeSubmissionSchema.safeParse({
      ...VALID_SUBMISSION,
      situation: { ...VALID_SUBMISSION.situation, timeline },
    });
    assert.equal(parsed.success, true, `"${timeline}" must be accepted verbatim`);
    if (parsed.success) assert.equal(toSellerFacts(parsed.data).timeline, timeline);
  }
  for (const stale of ['within_30_days', 'within_90_days', 'just_exploring']) {
    const parsed = intakeSubmissionSchema.safeParse({
      ...VALID_SUBMISSION,
      situation: { ...VALID_SUBMISSION.situation, timeline: stale },
    });
    assert.equal(parsed.success, false, `retired value "${stale}" must be rejected`);
  }
});

test('known damage rides in repairs.notes, the only free-text the spine accepts', () => {
  const parsed = intakeSubmissionSchema.parse({
    ...VALID_SUBMISSION,
    context: { ...VALID_SUBMISSION.context, knownDamage: 'Roof leak over the kitchen' },
  });
  const facts = toSellerFacts(parsed);
  assert.equal((facts.repairs as { notes?: string }).notes, 'Roof leak over the kitchen');
});

test('the fingerprint covers answers the spine never receives', () => {
  const base = intakeSubmissionSchema.parse(VALID_SUBMISSION);
  const changed = intakeSubmissionSchema.parse({
    ...VALID_SUBMISSION,
    // Not forwarded upstream — but correcting it must still re-evaluate rather
    // than replay a stale result.
    context: { ...VALID_SUBMISSION.context, bedrooms: 9 },
  });
  assert.notDeepEqual(toFingerprintFacts(base), toFingerprintFacts(changed));
  assert.deepEqual(toSellerFacts(base), toSellerFacts(changed));
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

/* ── Mobile input sizing ────────────────────────────────────────────────────── */

test('seller controls stay at 16px or larger, so iOS does not zoom on focus', async () => {
  // Asserted against the SOURCE rather than a rendered tree: the shared control
  // class is a plain string, and importing the client component here would drag
  // React and JSX into a hermetic node suite for no extra confidence.
  //
  // Below 16px, iOS Safari zooms the viewport when a text/number/select/textarea
  // control receives focus, reflowing the page out from under a seller who is
  // mid-form. This was measured at 15px on every mobile viewport before the fix.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../../components/offerr/seller-journey/journey-chrome.tsx', import.meta.url),
    'utf8',
  );

  const declaration = source.slice(source.indexOf('export const inputClass'));
  const body = declaration.slice(0, declaration.indexOf('\n\n'));

  const sizes = [...body.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 0, 'inputClass must declare an explicit font size');
  for (const px of sizes) {
    assert.ok(px >= 16, `seller control font size ${px}px would trigger iOS focus zoom`);
  }

  // A responsive variant could reintroduce a sub-16px size on a breakpoint that
  // is never tested. Catch that at the source.
  const responsiveSmaller = [...body.matchAll(/(?:sm|md|lg|xl):text-\[(\d+(?:\.\d+)?)px\]/g)]
    .map((m) => Number(m[1]))
    .filter((px) => px < 16);
  assert.deepEqual(responsiveSmaller, [], 'a breakpoint override must not drop below 16px');
});

test('every enum value a seller can pick has a human label on the review screen', async () => {
  // Guards a whole class of quiet regression: renaming a schema value without
  // the matching LABELS entry makes the review step fall back to the raw enum,
  // so the seller confirms "90_days_plus" instead of "90 days or more". It
  // renders, it does not throw, and only a human looking at the screen notices.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../../components/offerr/seller-journey/step-review.tsx', import.meta.url),
    'utf8',
  );
  const labels = source.slice(source.indexOf('const LABELS'));
  const labelled = new Set(
    [...labels.slice(0, labels.indexOf('\n}')).matchAll(/(?:^|\s|")([a-z0-9_]+)"?\s*:/gm)].map((m) => m[1]),
  );

  const shape = intakeSubmissionSchema.shape;
  const enumsToCheck: Array<[string, readonly string[]]> = [
    ['propertyType', (shape.context as never as { shape: Record<string, { options: string[] }> }).shape.propertyType.options],
    ['occupancy', (shape.context as never as { shape: Record<string, { options: string[] }> }).shape.occupancy.options],
    ['condition', (shape.context as never as { shape: Record<string, { options: string[] }> }).shape.condition.options],
    ['repairLevel', (shape.context as never as { shape: Record<string, { options: string[] }> }).shape.repairLevel.options],
    ['timeline', (shape.situation as never as { shape: Record<string, { options: string[] }> }).shape.timeline.options],
    ['decisionMaker', (shape.situation as never as { shape: Record<string, { options: string[] }> }).shape.decisionMaker.options],
  ];

  for (const [field, options] of enumsToCheck) {
    for (const option of options) {
      assert.ok(
        labelled.has(option),
        `${field} value "${option}" has no LABELS entry — the review screen would show the raw enum`,
      );
    }
  }
});
