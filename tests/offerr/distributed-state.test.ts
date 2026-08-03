/**
 * Distributed state against REAL Postgres.
 *
 * The in-memory store in `boundary.test.ts` proves the INTERFACE behaves. It
 * cannot prove the property that actually matters — that two requests landing on
 * two different serverless instances converge — because a single process has no
 * instances to disagree.
 *
 * These tests open INDEPENDENT connections, which is the closest faithful
 * analogue of separate instances, and assert the atomic guarantees:
 *
 *   - N concurrent consumers of one limit admit exactly the limit, never more;
 *   - N concurrent reservations of one idempotency key elect exactly one winner;
 *   - a result is readable only by the session that produced it;
 *   - a released reservation frees the key for a genuine retry.
 *
 * SKIPPED unless `OFFERR_PREVIEW_STATE_DATABASE_URL` is set, so the default
 * suite stays hermetic. Run against the preview branch with:
 *
 *   OFFERR_PREVIEW_STATE_DATABASE_URL=... \
 *     node --conditions=react-server --test tests/offerr/distributed-state.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.OFFERR_SESSION_SECRET ||= 'test-signing-secret-for-offerr-preview';

import { Pool } from 'pg';

import { SUPABASE_ROOT_2021_CA } from '../../lib/offerr/supabase-ca.ts';
import { failureToSellerSafe } from '../../lib/offerr/outcomes.ts';

const DB_URL = String(process.env.OFFERR_PREVIEW_STATE_DATABASE_URL ?? '').trim();
const skip = DB_URL ? false : 'OFFERR_PREVIEW_STATE_DATABASE_URL not set';

/**
 * A separate pool per logical "instance". Sharing one pool would let Postgres
 * serialize the calls behind a single connection and quietly turn a concurrency
 * test into a sequential one.
 */
function instance() {
  return new Pool({ connectionString: DB_URL, max: 1, ssl: { rejectUnauthorized: true, ca: SUPABASE_ROOT_2021_CA } });
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

test('a rate limit admits exactly its allowance across concurrent instances', { skip }, async () => {
  const key = uniq('rate');
  const LIMIT = 4;
  const CALLERS = 12;

  const decisions = await withInstances(CALLERS, (pools) =>
    Promise.all(
      pools.map(async (pool) => {
        const res = await pool.query(
          'SELECT allowed FROM offerr_preview.rate_consume($1, $2, $3)',
          [key, LIMIT, 60_000],
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

test('every concurrent call is counted — no lost updates', { skip }, async () => {
  const key = uniq('count');
  const CALLERS = 12;

  await withInstances(CALLERS, (pools) =>
    Promise.all(
      pools.map((pool) =>
        pool.query('SELECT allowed FROM offerr_preview.rate_consume($1, $2, $3)', [key, 2, 60_000]),
      ),
    ),
  );

  await withInstances(1, async ([pool]) => {
    const res = await pool.query('SELECT count FROM offerr_preview.rate_buckets WHERE key = $1', [key]);
    assert.equal(Number(res.rows[0].count), CALLERS, 'a read-then-write limiter would lose increments here');
    await pool.query('DELETE FROM offerr_preview.rate_buckets WHERE key = $1', [key]);
  });
});

test('concurrent submissions on different instances elect ONE winner', { skip }, async () => {
  const key = uniq('idem');
  const sid = uniq('sid');
  const CALLERS = 8;

  const results = await withInstances(CALLERS, (pools) =>
    Promise.all(
      pools.map(async (pool, i) => {
        const res = await pool.query(
          'SELECT won, state FROM offerr_preview.reserve($1, $2, $3, $4, $5)',
          [key, sid, `result-${i}`, 1_800_000, 30_000],
        );
        return res.rows[0] as { won: boolean; state: string };
      }),
    ),
  );

  const winners = results.filter((r) => r.won).length;
  assert.equal(winners, 1, `exactly one instance may evaluate; ${winners} did`);
  assert.ok(
    results.filter((r) => !r.won).every((r) => r.state === 'pending'),
    'every loser must observe the in-flight reservation and wait, not start its own',
  );

  await withInstances(1, ([pool]) => pool.query('DELETE FROM offerr_preview.results WHERE idempotency_key = $1', [key]));
});

test('a completed result is readable only by its own session', { skip }, async () => {
  const key = uniq('read');
  const sid = uniq('sid');
  const resultId = uniq('res');
  const result = failureToSellerSafe('insufficient_data', 'CODE1234');

  await withInstances(2, async ([writer, reader]) => {
    await writer.query('SELECT won FROM offerr_preview.reserve($1, $2, $3, $4, $5)', [
      key, sid, resultId, 1_800_000, 30_000,
    ]);
    await writer.query('SELECT offerr_preview.complete($1, $2, $3::jsonb, $4)', [
      key, resultId, JSON.stringify(result), 1_800_000,
    ]);

    // A DIFFERENT connection — the durability claim is that another instance
    // can serve a result it never produced.
    const mine = await reader.query('SELECT status FROM offerr_preview.read_result($1, $2)', [resultId, sid]);
    assert.equal(mine.rows[0].status, 'ok', 'another instance must be able to serve the result');

    const theirs = await reader.query('SELECT status FROM offerr_preview.read_result($1, $2)', [
      resultId, `${sid}-intruder`,
    ]);
    assert.equal(theirs.rows[0].status, 'not_found', 'a cross-session read must be indistinguishable from missing');

    await writer.query('DELETE FROM offerr_preview.results WHERE idempotency_key = $1', [key]);
  });
});

test('a released reservation frees the key for a genuine retry', { skip }, async () => {
  const key = uniq('release');
  const sid = uniq('sid');

  await withInstances(2, async ([a, b]) => {
    const first = await a.query('SELECT won FROM offerr_preview.reserve($1, $2, $3, $4, $5)', [
      key, sid, 'r-1', 1_800_000, 30_000,
    ]);
    assert.equal(first.rows[0].won, true);

    // The evaluation failed transiently and released rather than caching.
    await a.query('SELECT offerr_preview.release($1)', [key]);

    const retry = await b.query('SELECT won FROM offerr_preview.reserve($1, $2, $3, $4, $5)', [
      key, sid, 'r-2', 1_800_000, 30_000,
    ]);
    assert.equal(retry.rows[0].won, true, 'a retryable failure must not occupy the key');

    await b.query('DELETE FROM offerr_preview.results WHERE idempotency_key = $1', [key]);
  });
});

test('an expired lease is reclaimable so a dead instance cannot wedge a key', { skip }, async () => {
  const key = uniq('lease');
  const sid = uniq('sid');

  await withInstances(2, async ([dead, live]) => {
    // Lease already lapsed: this models an instance that won the reservation and
    // then died before publishing.
    await dead.query('SELECT won FROM offerr_preview.reserve($1, $2, $3, $4, $5)', [
      key, sid, 'r-dead', 1_800_000, -1_000,
    ]);

    const reclaimed = await live.query('SELECT won FROM offerr_preview.reserve($1, $2, $3, $4, $5)', [
      key, sid, 'r-live', 1_800_000, 30_000,
    ]);
    assert.equal(reclaimed.rows[0].won, true, 'a lapsed lease must be reclaimable');

    await live.query('DELETE FROM offerr_preview.results WHERE idempotency_key = $1', [key]);
  });
});
