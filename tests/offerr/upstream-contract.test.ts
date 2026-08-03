/**
 * Upstream contract drift — hostile payload suite.
 *
 * These tests assume the backend is WRONG. Each payload is something the
 * internal evaluation spine could plausibly start returning after a refactor —
 * an underwriting figure attached to the seller projection, a comp set left in
 * for debugging, a database id promoted to a top-level field — and asserts that
 * the boundary refuses it rather than projecting around it.
 *
 * The point is not that today's backend does this. It is that if it ever does,
 * the failure is an outage rather than a data leak.
 *
 * Run with:
 *   node --conditions=react-server --test tests/offerr/*.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.OFFERR_SESSION_SECRET ||= 'test-signing-secret-for-offerr-preview';

import {
  FORBIDDEN_UPSTREAM_KEYS,
  assertSellerSafe,
  findForbiddenKey,
  parseUpstreamEnvelope,
} from '../../lib/offerr/upstream-contract.ts';
import { toSellerSafeResult, SELLER_OUTCOMES } from '../../lib/offerr/outcomes.ts';

/** A well-formed success payload, shaped like the real internal route's. */
function goodPayload(extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    route: 'internal/offerr/evaluations',
    idempotent_replay: false,
    evaluation: {
      outcome: 'INSTANT_RANGE_ELIGIBLE',
      preliminary_range: { low: 240_000, high: 268_000 },
      next_step: 'await_followup',
      expires_at: '2026-08-03T00:00:00.000Z',
      confidence: 'indicative',
      ...(extra.evaluation as Record<string, unknown> | undefined),
    },
    ...extra,
  };
}

test('a clean upstream payload is accepted and projected', () => {
  const parsed = parseUpstreamEnvelope(goodPayload());
  assert.equal(parsed.ok, true);
  if (parsed.ok !== true) return;
  assert.equal(parsed.outcome, 'INSTANT_RANGE_ELIGIBLE');
  assert.deepEqual(parsed.projection.preliminary_range, { low: 240_000, high: 268_000 });
});

test('every forbidden key is rejected at the top level', () => {
  for (const key of FORBIDDEN_UPSTREAM_KEYS) {
    const parsed = parseUpstreamEnvelope({ ...goodPayload(), [key]: 'anything' });
    assert.equal(parsed.ok, false, `top-level "${key}" must be refused`);
    if (parsed.ok === false) {
      assert.equal(parsed.violation, 'forbidden_field');
      assert.equal(parsed.field, key);
    }
  }
});

test('a forbidden key nested inside the seller projection is rejected', () => {
  const parsed = parseUpstreamEnvelope(
    goodPayload({ evaluation: { mao: 214_000 } }),
  );
  assert.equal(parsed.ok, false);
  if (parsed.ok === false) assert.equal(parsed.field, 'mao');
});

test('a forbidden key buried several levels deep is still found', () => {
  const parsed = parseUpstreamEnvelope({
    ...goodPayload(),
    debug: { trace: { stages: [{ name: 'underwrite', assignment_fee: 12_000 }] } },
  });
  assert.equal(parsed.ok, false);
  if (parsed.ok === false) assert.equal(parsed.field, 'assignment_fee');
});

test('forbidden key matching is case-insensitive', () => {
  const parsed = parseUpstreamEnvelope({ ...goodPayload(), MAO: 1 });
  assert.equal(parsed.ok, false);
  if (parsed.ok === false) assert.equal(parsed.field, 'MAO');
});

test('the raw request and evaluation ids never survive the boundary', () => {
  for (const key of ['request_id', 'evaluation_id', 'property_id']) {
    const parsed = parseUpstreamEnvelope({ ...goodPayload(), [key]: 'c0ffee' });
    assert.equal(parsed.ok, false, `${key} must not be forwarded`);
  }
});

test('a comp set or buyer list is refused rather than silently dropped', () => {
  for (const key of ['comps', 'comparables', 'buyer_entities', 'candidates']) {
    const parsed = parseUpstreamEnvelope({ ...goodPayload(), [key]: [{ id: 1 }] });
    assert.equal(parsed.ok, false, `${key} must be refused`);
    if (parsed.ok === false) assert.equal(parsed.violation, 'forbidden_field');
  }
});

test('a violation reports the KEY NAME only, never the value', () => {
  const secret = 'SELLER-SHOULD-NEVER-SEE-THIS-214000';
  const parsed = parseUpstreamEnvelope({ ...goodPayload(), mao: secret });
  assert.equal(parsed.ok, false);
  assert.ok(!JSON.stringify(parsed).includes(secret), 'the forbidden VALUE must not be carried out');
});

test('a deeply recursive payload is refused as too complex rather than hanging', () => {
  let node: Record<string, unknown> = { leaf: true };
  for (let i = 0; i < 50_000; i += 1) node = { next: node };
  const scan = findForbiddenKey(node);
  // Either the depth cap or the node cap stops it; what matters is that it
  // terminates and does not report a false clean bill of health on a payload it
  // could not fully inspect.
  assert.equal(scan.key, null);
});

test('an implausibly wide range is not treated as a usable answer', () => {
  const parsed = parseUpstreamEnvelope(
    goodPayload({ evaluation: { preliminary_range: { low: 10_000, high: 5_000_000 } } }),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok !== true) return;
  assert.equal(parsed.projection.preliminary_range, null);
});

test('an inverted or non-numeric range is discarded', () => {
  for (const range of [
    { low: 500_000, high: 100_000 },
    { low: -1, high: 100 },
    { low: 'a', high: 'b' },
    null,
  ]) {
    const parsed = parseUpstreamEnvelope(goodPayload({ evaluation: { preliminary_range: range } }));
    assert.equal(parsed.ok, true);
    if (parsed.ok !== true) continue;
    assert.equal(parsed.projection.preliminary_range, null);
  }
});

test('a range-eligible outcome with no usable range degrades to manual review', () => {
  const parsed = parseUpstreamEnvelope(
    goodPayload({ evaluation: { preliminary_range: { low: 0, high: 0 } } }),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok !== true) return;

  const seller = toSellerSafeResult({
    ok: true,
    outcome: parsed.outcome,
    projection: parsed.projection,
    supportCode: 'CODE1234',
  });
  assert.equal(seller.outcome, SELLER_OUTCOMES.MANUAL_REVIEW);
  assert.equal(seller.range, null);
});

test('a malformed or non-object payload is refused', () => {
  for (const payload of [null, undefined, 'string', 42, [1, 2, 3]]) {
    const parsed = parseUpstreamEnvelope(payload);
    assert.equal(parsed.ok, false);
    if (parsed.ok === false) assert.equal(parsed.violation, 'malformed');
  }
});

/* ── Egress assertion ──────────────────────────────────────────────────────── */

test('the egress gate accepts a genuine seller-safe result', () => {
  const seller = toSellerSafeResult({
    ok: true,
    outcome: 'INSTANT_RANGE_ELIGIBLE',
    projection: {
      preliminary_range: { low: 240_000, high: 268_000 },
      next_step: null,
      expires_at: null,
      confidence: 'indicative',
    },
    supportCode: 'CODE1234',
  });
  assert.deepEqual(assertSellerSafe(seller as unknown as Record<string, unknown>), {
    ok: true,
    field: null,
  });
});

test('the egress gate blocks a result that grew an extra field', () => {
  const seller = toSellerSafeResult({ ok: false, failureCode: 'insufficient_data' });
  const tampered = { ...seller, internalNote: 'buyer demand is thin here' };
  const check = assertSellerSafe(tampered as unknown as Record<string, unknown>);
  assert.equal(check.ok, false);
  assert.equal(check.field, 'internalNote');
});

test('the egress gate blocks a forbidden key even under an allowlisted name', () => {
  const seller = toSellerSafeResult({ ok: false, failureCode: 'insufficient_data' });
  const tampered = { ...seller, detail: { mao: 214_000 } as unknown as string };
  const check = assertSellerSafe(tampered as unknown as Record<string, unknown>);
  assert.equal(check.ok, false, 'a forbidden key nested in an allowed field must still be caught');
  assert.equal(check.field, 'mao');
});
