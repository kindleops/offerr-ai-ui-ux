/**
 * Offerr closed-preview — gates, sessions, idempotency, rate limiting and
 * result isolation.
 *
 * Run with:
 *   node --conditions=react-server --test tests/offerr/*.test.ts
 */

import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Set before any signing happens. `session.ts` reads the secret lazily inside
// signingKey(), so a static import is safe here.
process.env.OFFERR_SESSION_SECRET ||= 'test-signing-secret-for-offerr-preview';

import * as config from '../../lib/offerr/preview-config.ts';
import * as session from '../../lib/offerr/session.ts';
import * as rateLimit from '../../lib/offerr/rate-limit.ts';
import * as store from '../../lib/offerr/result-store.ts';
import * as previewStore from '../../lib/offerr/preview-store.ts';
import { failureToSellerSafe } from '../../lib/offerr/outcomes.ts';

const TOKEN = 'preview-token-abc123';

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    previous[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/* ── Gates ─────────────────────────────────────────────────────────────────── */

test('a production deployment is refused even when every other gate is open', () => {
  withEnv(
    {
      VERCEL_ENV: 'production',
      OFFERR_PUBLIC_INTAKE_ENABLED: 'true',
      OFFERR_PREVIEW_ACCESS_TOKEN: TOKEN,
    },
    () => {
      const gate = config.evaluateGates(TOKEN);
      assert.equal(gate.ok, false);
      assert.equal(gate.failure, 'production_deployment');
    },
  );
});

test('the public surface gate is independent of the internal engine flag', () => {
  // No internal engine flag exists in this app at all; the public gate alone
  // decides. Turning the engine on elsewhere cannot open this surface.
  withEnv(
    {
      VERCEL_ENV: 'preview',
      OFFERR_PUBLIC_INTAKE_ENABLED: 'false',
      OFFERR_PREVIEW_ACCESS_TOKEN: TOKEN,
      // Deliberately present and enabled — must have no effect here.
      OFFERR_EVALUATION_ENABLED: 'true',
    },
    () => {
      const gate = config.evaluateGates(TOKEN);
      assert.equal(gate.ok, false);
      assert.equal(gate.failure, 'public_intake_disabled');
    },
  );
});

test('an unset preview token fails CLOSED rather than admitting everyone', () => {
  withEnv(
    {
      VERCEL_ENV: 'preview',
      OFFERR_PUBLIC_INTAKE_ENABLED: 'true',
      OFFERR_PREVIEW_ACCESS_TOKEN: undefined,
    },
    () => {
      assert.equal(config.evaluateGates(null).failure, 'preview_access_not_configured');
      assert.equal(config.evaluateGates('anything').failure, 'preview_access_not_configured');
    },
  );
});

test('a wrong or missing token is denied, a correct one is admitted', () => {
  withEnv(
    {
      VERCEL_ENV: 'preview',
      OFFERR_PUBLIC_INTAKE_ENABLED: 'true',
      OFFERR_PREVIEW_ACCESS_TOKEN: TOKEN,
    },
    () => {
      assert.equal(config.evaluateGates(null).failure, 'preview_access_denied');
      assert.equal(config.evaluateGates('wrong').failure, 'preview_access_denied');
      assert.equal(config.evaluateGates(TOKEN).ok, true);
    },
  );
});

test('a denied visitor is never told WHICH gate refused', () => {
  withEnv(
    { VERCEL_ENV: 'preview', OFFERR_PUBLIC_INTAKE_ENABLED: 'false', OFFERR_PREVIEW_ACCESS_TOKEN: TOKEN },
    () => {
      const summary = config.publicGateSummary('wrong');
      assert.equal(summary.admitted, false);
      assert.equal(summary.reason, 'not_available');
      assert.equal(JSON.stringify(summary).includes('public_intake_disabled'), false);
    },
  );
});

test('the synthetic evaluator can never be enabled on a production deployment', () => {
  withEnv({ VERCEL_ENV: 'production', OFFERR_PREVIEW_SYNTHETIC_EVALUATOR: 'true' }, () => {
    assert.equal(config.internalEvaluationConfig().syntheticEnabled, false);
  });
  withEnv({ VERCEL_ENV: 'preview', OFFERR_PREVIEW_SYNTHETIC_EVALUATOR: 'true' }, () => {
    assert.equal(config.internalEvaluationConfig().syntheticEnabled, true);
  });
});

/* ── Secret non-exposure ───────────────────────────────────────────────────── */

test('no gate-facing value ever carries the internal secret or the preview token', () => {
  withEnv(
    {
      VERCEL_ENV: 'preview',
      OFFERR_PUBLIC_INTAKE_ENABLED: 'true',
      OFFERR_PREVIEW_ACCESS_TOKEN: TOKEN,
      OFFERR_INTERNAL_API_SECRET: 'super-secret-internal-value',
    },
    () => {
      const serialized = JSON.stringify(config.publicGateSummary(TOKEN));
      assert.ok(!serialized.includes('super-secret-internal-value'));
      assert.ok(!serialized.includes(TOKEN));
    },
  );
});

/* ── Session ───────────────────────────────────────────────────────────────── */

test('a session round-trips, and a tampered session is rejected', () => {
  const created = session.createSession();
  const cookie = session.serializeSession(created);

  const parsed = session.parseSession(cookie);
  assert.equal(parsed?.sid, created.sid);

  // Flip a character in the signature.
  const [sid, iat, sig] = cookie.split('.');
  const forgedSig = `${sig.slice(0, -1)}${sig.slice(-1) === 'A' ? 'B' : 'A'}`;
  assert.equal(session.parseSession(`${sid}.${iat}.${forgedSig}`), null);

  // Re-sign a DIFFERENT sid with the original signature.
  assert.equal(session.parseSession(`someoneelse.${iat}.${sig}`), null);
  assert.equal(session.parseSession('garbage'), null);
  assert.equal(session.parseSession(null), null);
});

test('an expired session is rejected', () => {
  const old = session.createSession(Date.now() - session.SESSION_TTL_MS - 1000);
  assert.equal(session.parseSession(session.serializeSession(old)), null);
});

test('CSRF tokens are per-session and are not interchangeable', () => {
  const a = session.createSession();
  const b = session.createSession();
  assert.equal(session.csrfValid(a.sid, session.csrfTokenFor(a.sid)), true);
  assert.equal(session.csrfValid(a.sid, session.csrfTokenFor(b.sid)), false);
  assert.equal(session.csrfValid(a.sid, ''), false);
  assert.equal(session.csrfValid(a.sid, null), false);
});

/* ── Idempotency ───────────────────────────────────────────────────────────── */

test('the same answers produce the same key; any change produces a new one', () => {
  const sid = 'session-one';
  const base = {
    normalizedAddress: '500 Main St, Dallas, TX 75201',
    unit: '',
    sellerFacts: { condition: { value: 'good' } },
  };

  const k1 = session.deriveIdempotencyKey(sid, session.submissionFingerprint(base));
  const k2 = session.deriveIdempotencyKey(sid, session.submissionFingerprint({ ...base }));
  assert.equal(k1, k2, 'a refresh with identical answers must replay, not re-evaluate');

  const changed = session.deriveIdempotencyKey(
    sid,
    session.submissionFingerprint({ ...base, sellerFacts: { condition: { value: 'poor' } } }),
  );
  assert.notEqual(k1, changed, 'a corrected answer must be a NEW evaluation');
});

test('key order in seller facts does not change the fingerprint', () => {
  const a = session.submissionFingerprint({
    normalizedAddress: '1 A St',
    sellerFacts: { b: 2, a: 1 },
  });
  const b = session.submissionFingerprint({
    normalizedAddress: '1 A St',
    sellerFacts: { a: 1, b: 2 },
  });
  assert.equal(a, b);
});

test('two sessions submitting identical answers get DIFFERENT idempotency keys', () => {
  const fingerprint = session.submissionFingerprint({ normalizedAddress: '500 Main St' });
  assert.notEqual(
    session.deriveIdempotencyKey('session-a', fingerprint),
    session.deriveIdempotencyKey('session-b', fingerprint),
    'one session must never be able to consume or replay another session key',
  );
});

test('the idempotency key is not a reversible digest of the address', () => {
  const fingerprint = session.submissionFingerprint({ normalizedAddress: '500 Main St' });
  const key = session.deriveIdempotencyKey('sid', fingerprint);
  assert.ok(!key.toLowerCase().includes('main'));
  assert.ok(!key.includes('500'));
});

/* ── Result store isolation ────────────────────────────────────────────────── */

/**
 * The store is DISTRIBUTED in every deployed environment (Postgres, atomic SQL).
 * These unit tests drive the same interface through the in-memory
 * implementation so they stay deterministic and need no database; the
 * distributed guarantees themselves are proven against real Postgres in
 * `tests/offerr/distributed-state.test.ts`.
 */
let mem: ReturnType<typeof previewStore.__newMemoryStoreForTests>;

beforeEach(() => {
  mem = previewStore.__newMemoryStoreForTests();
  previewStore.__setPreviewStoreForTests(mem);
});

async function seed(resultId: string, sid: string, key: string, ttlMs = 30 * 60 * 1000) {
  const result = failureToSellerSafe('insufficient_data', 'CODE1234');
  await mem.reserve(key, sid, resultId, ttlMs, 45_000);
  await mem.complete(key, resultId, result, ttlMs);
  return result;
}

test('a result is readable by its own session and invisible to any other', async () => {
  await seed('r-1', 'owner', 'k-1');

  assert.equal((await store.readResult('r-1', 'owner')).status, 'ok');
  assert.equal(
    (await store.readResult('r-1', 'someone-else')).status,
    'not_found',
    'a cross-session read must be indistinguishable from a missing result',
  );
});

test('an expired result reports expired rather than returning stale data', async () => {
  await seed('r-2', 'owner', 'k-2', 10);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal((await store.readResult('r-2', 'owner')).status, 'expired');
});

test('an unknown result id is not_found, not an error that confirms the space', async () => {
  assert.equal((await store.readResult('never-existed', 'owner')).status, 'not_found');
});

test('a replay finds the stored result by idempotency key, scoped to the session', async () => {
  await seed('r-3', 'owner', 'k-3');
  assert.ok(await store.findByIdempotencyKey('k-3', 'owner'));
  assert.equal(await store.findByIdempotencyKey('k-3', 'intruder'), null);
});

test('a pending reservation is not a result and is never replayed as one', async () => {
  await mem.reserve('k-pending', 'owner', 'r-pending', 30 * 60 * 1000, 45_000);
  assert.equal(
    await store.findByIdempotencyKey('k-pending', 'owner'),
    null,
    'an in-flight evaluation must not be served as a finished result',
  );
});

test('concurrent submissions of one key collapse onto a single evaluation', async () => {
  let calls = 0;
  const work = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 25));
    return { result: failureToSellerSafe('insufficient_data', null), cacheable: true };
  };

  let n = 0;
  const nextId = () => `r-conc-${(n += 1)}`;

  const [a, b, c] = await Promise.all([
    store.runOnceForKey('k-concurrent', 'owner', nextId, work),
    store.runOnceForKey('k-concurrent', 'owner', nextId, work),
    store.runOnceForKey('k-concurrent', 'owner', nextId, work),
  ]);

  assert.equal(calls, 1, 'a double submit must not create a second snapshot');
  assert.equal(a.resultId, b.resultId);
  assert.equal(b.resultId, c.resultId);
});

test('a retryable outcome is not cached, so an immediate retry re-evaluates', async () => {
  let calls = 0;
  const work = async () => {
    calls += 1;
    // `unavailable_retryable` — the state the seller is told to retry.
    return { result: failureToSellerSafe('upstream_unavailable', null), cacheable: false };
  };

  await store.runOnceForKey('k-retry', 'owner', () => 'r-a', work);
  assert.equal(
    await store.findByIdempotencyKey('k-retry', 'owner'),
    null,
    'a failure the seller is told to retry must not occupy the idempotency key',
  );

  await store.runOnceForKey('k-retry', 'owner', () => 'r-b', work);
  assert.equal(calls, 2, 'the retry must actually re-run the evaluation');
});

/* ── Rate limiting ─────────────────────────────────────────────────────────── */

test('a session is limited after its allowance and told when to retry', async () => {
  const rule = { limit: 3, windowMs: 60_000 };
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await rateLimit.consume('k', rule)).allowed, true, `call ${i + 1} should pass`);
  }
  const blocked = await rateLimit.consume('k', rule);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test('the window resets so a limit is temporary, not permanent', async () => {
  const rule = { limit: 1, windowMs: 40 };
  assert.equal((await rateLimit.consume('k2', rule)).allowed, true);
  assert.equal((await rateLimit.consume('k2', rule)).allowed, false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal((await rateLimit.consume('k2', rule)).allowed, true);
});

test('a per-property cooldown applies to a repeat evaluation of the same property', async () => {
  assert.equal((await rateLimit.checkPropertyCooldown('sid', 'fp')).allowed, true);
  await rateLimit.markPropertyEvaluated('sid', 'fp');
  assert.equal((await rateLimit.checkPropertyCooldown('sid', 'fp')).allowed, false);
  // Another session is unaffected.
  assert.equal((await rateLimit.checkPropertyCooldown('other-sid', 'fp')).allowed, true);
});

test('rate limiting fails CLOSED when the store is unreachable', async () => {
  previewStore.__setPreviewStoreForTests({
    kind: 'postgres',
    durable: true,
    consume: async () => { throw new previewStore.StoreUnavailableError(); },
    cooldownCheck: async () => { throw new previewStore.StoreUnavailableError(); },
    cooldownMark: async () => {},
    reserve: async () => { throw new previewStore.StoreUnavailableError(); },
    complete: async () => {},
    release: async () => {},
    findByKey: async () => { throw new previewStore.StoreUnavailableError(); },
    readResult: async () => { throw new previewStore.StoreUnavailableError(); },
    healthy: async () => false,
  });

  const decision = await rateLimit.consume('anything', { limit: 100, windowMs: 60_000 });
  assert.equal(
    decision.allowed,
    false,
    'an unreachable limiter must refuse, never silently stop limiting',
  );
  assert.ok(decision.retryAfterSeconds > 0);
});

test('the client IP is hashed, never stored raw', () => {
  const headers = new Headers({ 'x-forwarded-for': '203.0.113.42, 70.41.3.18' });
  const ref = rateLimit.hashedClientIp(headers);
  assert.ok(!ref.includes('203.0.113.42'));
  assert.equal(ref.length, 16);
  // Stable for the same client, different for another.
  assert.equal(ref, rateLimit.hashedClientIp(new Headers({ 'x-forwarded-for': '203.0.113.42' })));
  assert.notEqual(ref, rateLimit.hashedClientIp(new Headers({ 'x-forwarded-for': '198.51.100.7' })));
});
