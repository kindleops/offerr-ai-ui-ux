/**
 * Durable-store integration tests — the ones that prove CROSS-INSTANCE
 * correctness.
 *
 * These are the only tests in the suite that a single-process unit test cannot
 * stand in for. Every property here is about what happens when two serverless
 * instances act on the same key at the same moment, which is exactly the case a
 * module-level `Map` gets wrong and a mock cannot expose.
 *
 * They run against the OfferrAI-owned `offerr_app` schema inside the shared
 * rei-automation data platform. Schema:
 *   rei-automation/apps/api/supabase/migrations/20260804120000_offerr_app_public_state.sql
 *
 * SKIPPED unless `OFFERR_APP_DATABASE_URL` is set, so the default suite needs no
 * database:
 *
 *   OFFERR_APP_DATABASE_URL=... \
 *     node --conditions=react-server --test tests/offerr/distributed-state.test.ts
 *
 * A skip here is NOT a pass. It means cross-instance correctness is unproven.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Pool } from 'pg';

import { SUPABASE_ROOT_2021_CA } from '../../lib/offerr/supabase-ca.ts';
import { failureToSellerSafe } from '../../lib/offerr/outcomes.ts';

const DB_URL = String(process.env.OFFERR_APP_DATABASE_URL ?? '').trim();
const skip = DB_URL ? false : 'OFFERR_APP_DATABASE_URL not set';

/**
 * A separate pool per logical "instance". Sharing one pool would let Postgres
 * serialize the calls behind a single connection and quietly turn a concurrency
 * test into a sequential one.
 */
function instance() {
  return new Pool({
    connectionString: DB_URL,
    max: 1,
    ssl: { rejectUnauthorized: true, ca: SUPABASE_ROOT_2021_CA },
  });
}

async function withInstances<T>(n: number, fn: (pools: Pool[]) => Promise<T>): Promise<T> {
  const pools = Array.from({ length: n }, instance);
  try {
    return await fn(pools);
  } finally {
    await Promise.all(pools.map((p) => p.end().catch(() => {})));
  }
}

const uniq = (label: string) => `test:${label}:${process.pid}:${Math.random().toString(36).slice(2)}`;

const SESSION_TTL_MS = 10 * 60 * 1000;

/** Reservations reference a session row, so tests must mint one first. */
async function newSession(pool: Pool): Promise<string> {
  const sid = uniq('sid');
  await pool.query('SELECT id FROM offerr_app.session_touch($1, $2, NULL)', [sid, SESSION_TTL_MS]);
  return sid;
}

// ── 1. Rate limiting is atomic across instances ─────────────────────────────

test('a rate limit admits exactly its allowance across concurrent instances', { skip }, async () => {
  const subject = uniq('rate');
  const LIMIT = 4;
  const CALLERS = 12;

  const decisions = await withInstances(CALLERS, (pools) =>
    Promise.all(
      pools.map(async (pool) => {
        const res = await pool.query(
          'SELECT allowed FROM offerr_app.rate_consume($1, $2, $3, $4, $5)',
          ['session', subject, 'submit', LIMIT, 60_000],
        );
        return res.rows[0].allowed as boolean;
      }),
    ),
  );

  const admitted = decisions.filter(Boolean).length;
  assert.equal(
    admitted,
    LIMIT,
    `exactly ${LIMIT} of ${CALLERS} concurrent callers may pass; got ${admitted}`,
  );
});

// ── 2. No lost updates ──────────────────────────────────────────────────────

test('every concurrent call is counted — no lost updates', { skip }, async () => {
  const subject = uniq('count');
  const CALLERS = 12;

  await withInstances(CALLERS, (pools) =>
    Promise.all(
      pools.map((pool) =>
        pool.query('SELECT allowed FROM offerr_app.rate_consume($1, $2, $3, $4, $5)', [
          'session',
          subject,
          'read',
          1_000,
          60_000,
        ]),
      ),
    ),
  );

  const pool = instance();
  try {
    const res = await pool.query(
      `SELECT counter FROM offerr_app.rate_limit_buckets
        WHERE scope = 'session' AND action = 'read'
          AND subject_hash = offerr_app.digest_key($1)`,
      [subject],
    );
    assert.equal(
      Number(res.rows[0]?.counter),
      CALLERS,
      'a read-then-write counter would drop increments under concurrency',
    );
  } finally {
    await pool.end().catch(() => {});
  }
});

// ── 3 & 4. Idempotency single-flight elects exactly one winner ──────────────

test('concurrent submissions on different instances elect ONE winner', { skip }, async () => {
  const key = uniq('idem');
  const CALLERS = 8;

  const setup = instance();
  let sid: string;
  try {
    sid = await newSession(setup);
  } finally {
    await setup.end().catch(() => {});
  }

  const wins = await withInstances(CALLERS, (pools) =>
    Promise.all(
      pools.map(async (pool) => {
        const res = await pool.query(
          'SELECT won FROM offerr_app.reserve($1, $2, $3, $4, $5)',
          [key, sid, uniq('lease'), 60_000, 30_000],
        );
        return res.rows[0].won as boolean;
      }),
    ),
  );

  assert.equal(
    wins.filter(Boolean).length,
    1,
    'exactly one instance may run the evaluation; the rest must wait on it',
  );
});

// ── 5. Cross-session denial ─────────────────────────────────────────────────

test('a completed result is readable only by its own session', { skip }, async () => {
  const key = uniq('own');
  const handle = uniq('handle');
  const pool = instance();

  try {
    const owner = await newSession(pool);
    const stranger = await newSession(pool);

    await pool.query('SELECT won FROM offerr_app.reserve($1, $2, $3, $4, $5)', [
      key,
      owner,
      uniq('lease'),
      60_000,
      30_000,
    ]);

    const result = failureToSellerSafe('insufficient_data', 'TESTCODE');
    await pool.query('SELECT offerr_app.complete($1, $2, $3, $4::jsonb, $5, $6)', [
      key,
      handle,
      String(result.outcome),
      JSON.stringify(result),
      'corr-test',
      60_000,
    ]);

    const mine = await pool.query(
      'SELECT status FROM offerr_app.read_result($1, $2)',
      [handle, owner],
    );
    assert.equal(mine.rows[0].status, 'ok', 'the owning session must recover its own result');

    const theirs = await pool.query(
      'SELECT status FROM offerr_app.read_result($1, $2)',
      [handle, stranger],
    );
    assert.equal(
      theirs.rows[0].status,
      'not_found',
      'another session must get not_found — "forbidden" would confirm the handle exists',
    );
  } finally {
    await pool.end().catch(() => {});
  }
});

// ── 6. A released reservation frees the key ─────────────────────────────────

test('a released reservation frees the key for a genuine retry', { skip }, async () => {
  const key = uniq('release');
  const pool = instance();

  try {
    const sid = await newSession(pool);

    const first = await pool.query('SELECT won FROM offerr_app.reserve($1, $2, $3, $4, $5)', [
      key, sid, uniq('lease'), 60_000, 30_000,
    ]);
    assert.equal(first.rows[0].won, true);

    const blocked = await pool.query('SELECT won FROM offerr_app.reserve($1, $2, $3, $4, $5)', [
      key, sid, uniq('lease'), 60_000, 30_000,
    ]);
    assert.equal(blocked.rows[0].won, false, 'a live reservation must not be displaceable');

    await pool.query('SELECT offerr_app.release($1)', [key]);

    const retried = await pool.query('SELECT won FROM offerr_app.reserve($1, $2, $3, $4, $5)', [
      key, sid, uniq('lease'), 60_000, 30_000,
    ]);
    assert.equal(retried.rows[0].won, true, 'a released key must be reservable again');
  } finally {
    await pool.end().catch(() => {});
  }
});

// ── 7. A lapsed lease is reclaimable ────────────────────────────────────────

test('an expired lease is reclaimable so a dead instance cannot wedge a key', { skip }, async () => {
  const key = uniq('lease');
  const pool = instance();

  try {
    const sid = await newSession(pool);

    // A lease of 0 ms is already lapsed the moment it is written — the state a
    // crashed instance leaves behind.
    const first = await pool.query('SELECT won FROM offerr_app.reserve($1, $2, $3, $4, $5)', [
      key, sid, uniq('dead-instance'), 60_000, 0,
    ]);
    assert.equal(first.rows[0].won, true);

    const takeover = await pool.query('SELECT won FROM offerr_app.reserve($1, $2, $3, $4, $5)', [
      key, sid, uniq('live-instance'), 60_000, 30_000,
    ]);
    assert.equal(
      takeover.rows[0].won,
      true,
      'a lapsed lease must be reclaimable, or a crash wedges the key until TTL',
    );
  } finally {
    await pool.end().catch(() => {});
  }
});

// ── Additional durability properties ────────────────────────────────────────

test('an expired result reports expired rather than returning stale data', { skip }, async () => {
  const key = uniq('expiry');
  const handle = uniq('handle');
  const pool = instance();

  try {
    const sid = await newSession(pool);
    await pool.query('SELECT won FROM offerr_app.reserve($1, $2, $3, $4, $5)', [
      key, sid, uniq('lease'), 60_000, 30_000,
    ]);

    const result = failureToSellerSafe('insufficient_data', 'TESTCODE');
    // A TTL of 0 ms is expired on arrival.
    await pool.query('SELECT offerr_app.complete($1, $2, $3, $4::jsonb, $5, $6)', [
      key, handle, String(result.outcome), JSON.stringify(result), 'corr-test', 0,
    ]);

    const read = await pool.query('SELECT status FROM offerr_app.read_result($1, $2)', [handle, sid]);
    assert.equal(read.rows[0].status, 'expired');
  } finally {
    await pool.end().catch(() => {});
  }
});

test('a cooldown blocks a repeat and reports when to retry', { skip }, async () => {
  const property = uniq('property');
  const pool = instance();

  try {
    const before = await pool.query('SELECT allowed FROM offerr_app.cooldown_check($1)', [property]);
    assert.equal(before.rows[0].allowed, true, 'an unseen property must not be on cooldown');

    await pool.query('SELECT offerr_app.cooldown_mark($1, $2)', [property, 60_000]);

    const after = await pool.query(
      'SELECT allowed, retry_after_seconds FROM offerr_app.cooldown_check($1)',
      [property],
    );
    assert.equal(after.rows[0].allowed, false);
    assert.ok(Number(after.rows[0].retry_after_seconds) > 0, 'a denial must say when to retry');
  } finally {
    await pool.end().catch(() => {});
  }
});

test('consent is stored per type and per version, never bundled', { skip }, async () => {
  const pool = instance();

  try {
    const sid = await newSession(pool);

    await pool.query('SELECT offerr_app.record_consent($1, $2, $3, $4, $5, $6)', [
      sid, 'evaluation', 'v1.0', 'copy-2026-08-04', true, 'desktop',
    ]);
    // Marketing DECLINED while evaluation is granted — the combination a single
    // bundled consent row cannot express.
    await pool.query('SELECT offerr_app.record_consent($1, $2, $3, $4, $5, $6)', [
      sid, 'marketing_email', 'v1.0', 'copy-2026-08-04', false, 'desktop',
    ]);

    const rows = await pool.query(
      `SELECT c.consent_type, c.granted, c.document_version
         FROM offerr_app.consent_records c
         JOIN offerr_app.sessions s ON s.id = c.session_id
        WHERE s.session_hash = offerr_app.digest_key($1)
        ORDER BY c.consent_type`,
      [sid],
    );

    assert.equal(rows.rows.length, 2, 'each consent type must be its own auditable row');
    const byType = Object.fromEntries(rows.rows.map((r) => [r.consent_type, r.granted]));
    assert.equal(byType.evaluation, true);
    assert.equal(byType.marketing_email, false);
  } finally {
    await pool.end().catch(() => {});
  }
});

test('the private schema is unreachable by anon and authenticated', { skip }, async () => {
  const pool = instance();

  try {
    for (const role of ['anon', 'authenticated']) {
      const usage = await pool.query('SELECT has_schema_privilege($1, $2, $3) AS ok', [
        role, 'offerr_app', 'USAGE',
      ]);
      assert.equal(usage.rows[0].ok, false, `${role} must have no USAGE on offerr_app`);

      for (const table of ['sessions', 'seller_results', 'consent_records', 'review_items']) {
        const priv = await pool.query('SELECT has_table_privilege($1, $2, $3) AS ok', [
          role, `offerr_app.${table}`, 'SELECT',
        ]);
        assert.equal(priv.rows[0].ok, false, `${role} must not SELECT offerr_app.${table}`);
      }
    }
  } finally {
    await pool.end().catch(() => {});
  }
});

test('a review item is created with no execution side effect', { skip }, async () => {
  const pool = instance();

  try {
    const sid = await newSession(pool);
    const reference = uniq('evalref');

    const created = await pool.query(
      'SELECT offerr_app.enqueue_review($1, $2, $3::jsonb, $4::jsonb, $5, $6::jsonb, $7) AS id',
      [
        reference,
        sid,
        JSON.stringify({ city: 'Springfield', state: 'IL' }),
        JSON.stringify({ condition: 'fair', timeline: '30_days' }),
        'manual_review',
        JSON.stringify({ low: 180000, high: 210000 }),
        'corr-test',
      ],
    );
    assert.ok(created.rows[0].id, 'a review item must be created');

    const row = await pool.query(
      'SELECT status FROM offerr_app.review_items WHERE evaluation_reference = $1',
      [reference],
    );
    assert.equal(
      row.rows[0].status,
      'pending_operator_action',
      'a new review item must require an explicit operator action, never auto-advance',
    );
  } finally {
    await pool.end().catch(() => {});
  }
});
