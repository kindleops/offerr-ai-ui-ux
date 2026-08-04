/**
 * Seller-facts translation contract.
 *
 * The preview integration failed because the OfferrAI form model and the spine's
 * accepted `seller_facts` were different vocabularies and nothing proved the
 * mapping between them. The spine validates fail-closed on unknown keys, so the
 * failure mode was total: one unrecognised key rejected the whole submission,
 * permanently, and the seller was told to retry.
 *
 * These tests exist so that failure cannot recur silently. They enumerate EVERY
 * valid combination the form can produce and assert the resulting payload is one
 * the spine accepts.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BACKEND_CONDITION_VALUES,
  BACKEND_OCCUPANCY_VALUES,
  BACKEND_REPAIRS_NOTES_MAX,
  BACKEND_REPAIR_LEVELS,
  BACKEND_SELLER_FACT_KEYS,
  BACKEND_TIMELINE_VALUES,
  INTENTIONALLY_UNFORWARDED_UI_FIELDS,
  UI_OCCUPANCY_VALUES,
  UI_REPAIRS_NOTES_MAX,
  assertSellerFactsAccepted,
} from '../../lib/offerr/seller-facts-contract.ts';
import {
  intakeSubmissionSchema,
  toFingerprintFacts,
  toSellerFacts,
} from '../../lib/offerr/intake-schema.ts';

/** A submission the form would actually produce, with overrides applied. */
function submissionOf(context: Record<string, unknown>, situation: Record<string, unknown> = {}) {
  return intakeSubmissionSchema.parse({
    property: { address: '742 Evergreen Terrace, Springfield, IL 62704', unit: '' },
    context: {
      propertyType: 'single_family',
      occupancy: 'owner_occupied',
      condition: 'good',
      repairLevel: 'cosmetic',
      ...context,
    },
    situation: {
      timeline: '30_days',
      isListed: false,
      decisionMaker: 'yes',
      ...situation,
    },
    contact: {},
    consent: { evaluationConsent: true },
  });
}

// ── The exhaustive matrix ───────────────────────────────────────────────────

test('EVERY valid UI combination produces a payload the spine accepts', () => {
  let combinations = 0;

  for (const condition of BACKEND_CONDITION_VALUES) {
    for (const occupancy of UI_OCCUPANCY_VALUES) {
      for (const repairLevel of BACKEND_REPAIR_LEVELS) {
        for (const timeline of BACKEND_TIMELINE_VALUES) {
          for (const withNotes of [false, true]) {
            for (const withPrice of [false, true]) {
              const facts = toSellerFacts(
                submissionOf(
                  {
                    condition,
                    occupancy,
                    repairLevel,
                    ...(withNotes ? { knownDamage: 'Roof leak above the garage' } : {}),
                  },
                  { timeline, ...(withPrice ? { askingPrice: 425_000 } : {}) },
                ),
              );

              const check = assertSellerFactsAccepted(facts);
              assert.equal(
                check.ok,
                true,
                `rejected ${condition}/${occupancy}/${repairLevel}/${timeline} → ${check.errors.join(', ')}`,
              );
              combinations += 1;
            }
          }
        }
      }
    }
  }

  // 4 conditions x 3 occupancies x 4 repair levels x 5 timelines x 2 x 2
  assert.equal(combinations, 960);
});

test('no UI combination can emit a key outside the spine allowlist', () => {
  const allowed = new Set<string>(BACKEND_SELLER_FACT_KEYS);

  for (const condition of BACKEND_CONDITION_VALUES) {
    for (const timeline of BACKEND_TIMELINE_VALUES) {
      const facts = toSellerFacts(
        submissionOf(
          {
            condition,
            bedrooms: 3,
            bathrooms: 2,
            units: 1,
            majorUpdates: ['roof', 'hvac'],
            knownDamage: 'Cracked driveway',
          },
          { timeline, askingPrice: 300_000, reason: 'relocation' },
        ),
      );

      for (const key of Object.keys(facts)) {
        assert.ok(allowed.has(key), `"${key}" is not an accepted seller_facts key`);
      }
    }
  }
});

// ── The specific fields the spine previously rejected ───────────────────────

test('every field the spine has no contract for is dropped, not forwarded', () => {
  const facts = toSellerFacts(
    submissionOf(
      {
        propertyType: 'multi_family_2_4',
        bedrooms: 4,
        bathrooms: 3,
        units: 3,
        majorUpdates: ['roof', 'kitchen', 'windows'],
        knownDamage: 'Foundation settling on the north wall',
      },
      { reason: 'inherited', isListed: true, decisionMaker: 'one_of_several', askingPrice: 512_000 },
    ),
  );

  // These are exactly the names that caused `seller_facts_unknown_key:<key>`.
  for (const dropped of [
    'propertyType',
    'property_type',
    'bedrooms',
    'bathrooms',
    'units',
    'majorUpdates',
    'major_updates',
    'reason',
    'isListed',
    'is_listed',
    'decisionMaker',
    'decision_maker',
    'knownDamage',
    'known_damage',
    'repairLevel',
    'repair_level',
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(facts, dropped),
      false,
      `"${dropped}" must never reach the spine`,
    );
  }

  // …while the answer itself is not lost: damage travels inside `repairs`.
  assert.equal(facts.repairs?.notes, 'Foundation settling on the north wall');
  assert.equal(facts.repairs?.level, 'cosmetic');
});

test('the unforwarded-field register covers every non-contract form field', () => {
  const formFields = [
    'propertyType',
    'bedrooms',
    'bathrooms',
    'units',
    'majorUpdates',
    'knownDamage',
    'reason',
    'isListed',
    'decisionMaker',
    'firstName',
    'email',
    'phone',
    'companyWebsite',
  ];

  for (const field of formFields) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(INTENTIONALLY_UNFORWARDED_UI_FIELDS, field),
      `"${field}" is collected but has no documented reason for not being forwarded`,
    );
  }
});

test('contact details never appear in the outbound payload', () => {
  const submission = intakeSubmissionSchema.parse({
    property: { address: '742 Evergreen Terrace, Springfield, IL 62704', unit: '2B' },
    context: {
      propertyType: 'condo',
      occupancy: 'tenant_occupied',
      condition: 'fair',
      repairLevel: 'moderate',
    },
    situation: { timeline: 'asap', isListed: false, decisionMaker: 'yes' },
    contact: { firstName: 'Dana', email: 'dana@example.com', phone: '555-0100' },
    consent: { evaluationConsent: true },
  });

  const serialized = JSON.stringify(toSellerFacts(submission));
  for (const pii of ['Dana', 'dana@example.com', '555-0100']) {
    assert.equal(serialized.includes(pii), false, `contact detail "${pii}" leaked upstream`);
  }
});

// ── Enum agreement with the mirrored backend contract ───────────────────────

test('the form offers only occupancy values the spine accepts', () => {
  const backend = new Set<string>(BACKEND_OCCUPANCY_VALUES);
  for (const value of UI_OCCUPANCY_VALUES) {
    assert.ok(backend.has(value), `form offers occupancy "${value}" the spine would reject`);
  }
  // `unknown` is accepted upstream but deliberately not offered: an unstated
  // occupancy is an omitted key, not a claim that it is unknown.
  assert.equal(UI_OCCUPANCY_VALUES.includes('unknown' as never), false);
});

test('the form rejects any enum value outside the mirrored contract', () => {
  for (const bad of [
    { context: { condition: 'pristine' } },
    { context: { occupancy: 'unknown' } },
    { context: { repairLevel: 'total_rebuild' } },
    { situation: { timeline: 'within_90_days' } },
  ]) {
    assert.throws(
      () => submissionOf(bad.context ?? {}, bad.situation ?? {}),
      `${JSON.stringify(bad)} should not parse`,
    );
  }
});

test('the form notes bound is stricter than the spine notes bound', () => {
  assert.ok(
    UI_REPAIRS_NOTES_MAX < BACKEND_REPAIRS_NOTES_MAX,
    'an over-long note must fail at the form, where it is correctable',
  );

  assert.throws(() => submissionOf({ knownDamage: 'x'.repeat(UI_REPAIRS_NOTES_MAX + 1) }));

  const atLimit = toSellerFacts(submissionOf({ knownDamage: 'x'.repeat(UI_REPAIRS_NOTES_MAX) }));
  assert.equal(assertSellerFactsAccepted(atLimit).ok, true);
});

// ── The validator itself ────────────────────────────────────────────────────

test('an unknown key is reported in the spine error vocabulary', () => {
  const check = assertSellerFactsAccepted({ condition: 'good', property_type: 'single_family' });
  assert.equal(check.ok, false);
  assert.ok(check.errors.includes('seller_facts_unknown_key:property_type'));
});

test('each invalid enum value is named precisely', () => {
  assert.ok(
    assertSellerFactsAccepted({ condition: 'pristine' }).errors.includes(
      'seller_facts_invalid_condition',
    ),
  );
  assert.ok(
    assertSellerFactsAccepted({ occupancy: 'squatters' }).errors.includes(
      'seller_facts_invalid_occupancy',
    ),
  );
  assert.ok(
    assertSellerFactsAccepted({ timeline: 'someday' }).errors.includes(
      'seller_facts_invalid_timeline',
    ),
  );
  assert.ok(
    assertSellerFactsAccepted({ repairs: { level: 'gut' } }).errors.includes(
      'seller_facts_invalid_repairs_level',
    ),
  );
});

test('an over-long repairs note is rejected at the mirrored spine bound', () => {
  const check = assertSellerFactsAccepted({
    repairs: { level: 'major', notes: 'x'.repeat(BACKEND_REPAIRS_NOTES_MAX + 1) },
  });
  assert.equal(check.ok, false);
  assert.ok(check.errors.includes('seller_facts_repairs_notes_too_long'));
});

test('a non-numeric asking price is rejected', () => {
  assert.equal(assertSellerFactsAccepted({ asking_price: 'a lot' }).ok, false);
  assert.equal(assertSellerFactsAccepted({ asking_price: -5 }).ok, false);
  // The spine strips currency formatting before parsing, so this is accepted.
  assert.equal(assertSellerFactsAccepted({ asking_price: '$425,000' }).ok, true);
});

test('a non-object payload is refused rather than coerced', () => {
  for (const bad of [null, undefined, 'facts', 42, ['condition']]) {
    const check = assertSellerFactsAccepted(bad);
    assert.equal(check.ok, false);
    assert.ok(check.errors.includes('seller_facts_must_be_object'));
  }
});

test('an empty payload is valid — every seller fact is optional', () => {
  assert.equal(assertSellerFactsAccepted({}).ok, true);
});

// ── The fingerprint must NOT be narrowed to the forwarded subset ────────────

test('the fingerprint covers answers the spine never receives', () => {
  const base = submissionOf({ bedrooms: 3 });
  const corrected = submissionOf({ bedrooms: 4 });

  // Identical on the wire — bedrooms is not forwarded…
  assert.deepEqual(toSellerFacts(base), toSellerFacts(corrected));

  // …but a corrected answer must still re-evaluate rather than replay a stale
  // result, so the fingerprint has to see it.
  assert.notDeepEqual(toFingerprintFacts(base), toFingerprintFacts(corrected));
});
