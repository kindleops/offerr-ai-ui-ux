/**
 * Durable, cross-instance preview state — SERVER ONLY.
 *
 * WHAT THIS REPLACES
 * ------------------
 * Rate-limit counters, the per-property cooldown, the idempotency single-flight
 * and the seller-safe result store all used to live in module-level `Map`s. On
 * serverless that is per-instance state, which means:
 *
 *   - a rate limit dilutes across concurrently-warm instances;
 *   - a double submit routed to two instances runs two upstream evaluations;
 *   - a result becomes unreadable as soon as its instance is recycled, so a
 *     seller who refreshes loses the answer they just waited for.
 *
 * Every one of those is now a row in Postgres, and every mutation that has to be
 * race-safe is a single atomic statement inside a SQL function (see
 * `supabase/offerr-preview-state.sql`). No read-then-write in application code.
 *
 * WHY DIRECT POSTGRES RATHER THAN THE SUPABASE REST API
 * -----------------------------------------------------
 * The state lives in its own `offerr_preview` schema which is deliberately NOT
 * exposed through PostgREST. Nothing about this surface is reachable over the
 * public REST API at all, by anyone, with any key — the only path in is a
 * server-side connection holding the database credential. That is a stronger
 * posture than "exposed but policy-restricted".
 *
 * FAIL CLOSED
 * -----------
 * If a durable store is REQUIRED (any deployed environment) and it cannot be
 * reached, the caller is refused. A rate limiter that silently stops limiting
 * when its backing store is down is worse than no rate limiter, because it
 * removes the signal that anything is wrong.
 */

import 'server-only';

import { Pool, type PoolClient } from 'pg';

import { isProductionDeployment } from './preview-config.ts';
import { SUPABASE_ROOT_2021_CA } from './supabase-ca.ts';
import type { SellerSafeResult } from './outcomes.ts';

export interface RateDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export type ReservationState = 'won' | 'pending' | 'ready' | 'gone';

export interface Reservation {
  state: ReservationState;
  resultId: string | null;
  result: SellerSafeResult | null;
}

export type ReadOutcome =
  | { status: 'ok'; result: SellerSafeResult; expiresAt: number }
  | { status: 'not_found' }
  | { status: 'expired' };

export interface PreviewStore {
  readonly kind: 'postgres' | 'memory';
  /** True when this store is shared across instances. */
  readonly durable: boolean;
  consume(key: string, limit: number, windowMs: number): Promise<RateDecision>;
  cooldownCheck(key: string): Promise<RateDecision>;
  cooldownMark(key: string, ms: number): Promise<void>;
  reserve(idempotencyKey: string, sid: string, resultId: string, ttlMs: number, leaseMs: number): Promise<Reservation>;
  complete(idempotencyKey: string, resultId: string, result: SellerSafeResult, ttlMs: number): Promise<void>;
  release(idempotencyKey: string): Promise<void>;
  findByKey(idempotencyKey: string, sid: string): Promise<Reservation>;
  readResult(resultId: string, sid: string): Promise<ReadOutcome>;
  healthy(): Promise<boolean>;
}

/** Raised when a durable store is required but unusable. Callers fail closed. */
export class StoreUnavailableError extends Error {
  constructor(message = 'preview store unavailable') {
    super(message);
    this.name = 'StoreUnavailableError';
  }
}

// ── Postgres ────────────────────────────────────────────────────────────────

let pool: Pool | null = null;

function getPool(connectionString: string): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString,
    // Serverless: many short-lived instances, each needing very few
    // connections. A large per-instance pool exhausts the database's slots long
    // before it helps throughput.
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    // Supabase terminates database TLS with its OWN private CA, so the default
    // trust store rejects it. Verification stays ON against that pinned root
    // rather than being disabled — this connection carries the database
    // credential, and `rejectUnauthorized: false` would accept any certificate
    // an attacker presented.
    ssl: {
      rejectUnauthorized: true,
      ca: String(process.env.OFFERR_PREVIEW_STATE_CA_CERT ?? '').trim() || SUPABASE_ROOT_2021_CA,
    },
  });
  pool.on('error', () => {
    // A pool-level error must not take the process down. The next query will
    // surface the failure and the caller fails closed.
  });
  return pool;
}

class PostgresStore implements PreviewStore {
  readonly kind = 'postgres' as const;
  readonly durable = true;

  // Written out rather than as a constructor parameter property: Node's
  // type-stripping test runner cannot compile those, and these modules are
  // executed unmodified by `node --test`.
  private readonly connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  private async query<T>(sql: string, params: unknown[]): Promise<T[]> {
    let client: PoolClient | null = null;
    try {
      client = await getPool(this.connectionString).connect();
      const res = await client.query(sql, params as never[]);
      return res.rows as T[];
    } catch (error) {
      throw new StoreUnavailableError((error as Error)?.name ?? 'query_failed');
    } finally {
      client?.release();
    }
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateDecision> {
    const rows = await this.query<{ allowed: boolean; remaining: number; retry_after_seconds: number }>(
      'SELECT allowed, remaining, retry_after_seconds FROM offerr_preview.rate_consume($1, $2, $3)',
      [key, limit, windowMs],
    );
    const row = rows[0];
    if (!row) throw new StoreUnavailableError('rate_consume returned no row');
    return {
      allowed: row.allowed,
      remaining: Number(row.remaining),
      retryAfterSeconds: Number(row.retry_after_seconds),
    };
  }

  async cooldownCheck(key: string): Promise<RateDecision> {
    const rows = await this.query<{ allowed: boolean; retry_after_seconds: number }>(
      'SELECT allowed, retry_after_seconds FROM offerr_preview.cooldown_check($1)',
      [key],
    );
    const row = rows[0];
    if (!row) throw new StoreUnavailableError('cooldown_check returned no row');
    return { allowed: row.allowed, remaining: row.allowed ? 1 : 0, retryAfterSeconds: Number(row.retry_after_seconds) };
  }

  async cooldownMark(key: string, ms: number): Promise<void> {
    await this.query('SELECT offerr_preview.cooldown_mark($1, $2)', [key, ms]);
  }

  async reserve(
    idempotencyKey: string,
    sid: string,
    resultId: string,
    ttlMs: number,
    leaseMs: number,
  ): Promise<Reservation> {
    const rows = await this.query<{ won: boolean; state: string; result_id: string | null; result: SellerSafeResult | null }>(
      'SELECT won, state, result_id, result FROM offerr_preview.reserve($1, $2, $3, $4, $5)',
      [idempotencyKey, sid, resultId, ttlMs, leaseMs],
    );
    const row = rows[0];
    if (!row) throw new StoreUnavailableError('reserve returned no row');
    if (row.won) return { state: 'won', resultId: row.result_id, result: null };
    return {
      state: (row.state === 'ready' ? 'ready' : row.state === 'pending' ? 'pending' : 'gone') as ReservationState,
      resultId: row.result_id,
      result: row.result,
    };
  }

  async complete(idempotencyKey: string, resultId: string, result: SellerSafeResult, ttlMs: number): Promise<void> {
    await this.query('SELECT offerr_preview.complete($1, $2, $3::jsonb, $4)', [
      idempotencyKey,
      resultId,
      JSON.stringify(result),
      ttlMs,
    ]);
  }

  async release(idempotencyKey: string): Promise<void> {
    await this.query('SELECT offerr_preview.release($1)', [idempotencyKey]);
  }

  async findByKey(idempotencyKey: string, sid: string): Promise<Reservation> {
    const rows = await this.query<{ state: string; result_id: string | null; result: SellerSafeResult | null }>(
      'SELECT state, result_id, result FROM offerr_preview.find_by_key($1, $2)',
      [idempotencyKey, sid],
    );
    const row = rows[0];
    if (!row || row.state === 'none') return { state: 'gone', resultId: null, result: null };
    return {
      state: (row.state === 'ready' ? 'ready' : 'pending') as ReservationState,
      resultId: row.result_id,
      result: row.result,
    };
  }

  async readResult(resultId: string, sid: string): Promise<ReadOutcome> {
    const rows = await this.query<{ status: string; result: SellerSafeResult | null; expires_at: string | null }>(
      'SELECT status, result, expires_at FROM offerr_preview.read_result($1, $2)',
      [resultId, sid],
    );
    const row = rows[0];
    if (!row || row.status === 'not_found') return { status: 'not_found' };
    if (row.status === 'expired') return { status: 'expired' };
    return {
      status: 'ok',
      result: row.result as SellerSafeResult,
      expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : Date.now(),
    };
  }

  async healthy(): Promise<boolean> {
    try {
      await this.query('SELECT 1', []);
      return true;
    } catch {
      return false;
    }
  }
}

// ── Memory (local development and unit tests ONLY) ──────────────────────────

/**
 * Explicitly NOT durable. Selected only when no durable store is configured AND
 * the deployment is local. It exists so `pnpm test` and `next dev` do not need a
 * database, never as a production fallback.
 */
class MemoryStore implements PreviewStore {
  readonly kind = 'memory' as const;
  readonly durable = false;

  private buckets = new Map<string, { count: number; resetAt: number }>();
  private cooldowns = new Map<string, number>();
  private rows = new Map<string, { resultId: string; sid: string; state: 'pending' | 'ready'; result: SellerSafeResult | null; expiresAt: number; leaseUntil: number }>();

  async consume(key: string, limit: number, windowMs: number): Promise<RateDecision> {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
    }
    existing.count += 1;
    if (existing.count > limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
    }
    return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
  }

  async cooldownCheck(key: string): Promise<RateDecision> {
    const now = Date.now();
    const until = this.cooldowns.get(key) ?? 0;
    if (until > now) return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)) };
    return { allowed: true, remaining: 1, retryAfterSeconds: 0 };
  }

  async cooldownMark(key: string, ms: number): Promise<void> {
    this.cooldowns.set(key, Date.now() + ms);
  }

  async reserve(idempotencyKey: string, sid: string, resultId: string, ttlMs: number, leaseMs: number): Promise<Reservation> {
    const now = Date.now();
    const existing = this.rows.get(idempotencyKey);
    if (!existing || (existing.state === 'pending' && existing.leaseUntil <= now)) {
      this.rows.set(idempotencyKey, { resultId, sid, state: 'pending', result: null, expiresAt: now + ttlMs, leaseUntil: now + leaseMs });
      return { state: 'won', resultId, result: null };
    }
    if (existing.sid !== sid || existing.expiresAt <= now) return { state: 'gone', resultId: null, result: null };
    return { state: existing.state === 'ready' ? 'ready' : 'pending', resultId: existing.resultId, result: existing.result };
  }

  async complete(idempotencyKey: string, resultId: string, result: SellerSafeResult, ttlMs: number): Promise<void> {
    const existing = this.rows.get(idempotencyKey);
    if (!existing) return;
    existing.state = 'ready';
    existing.result = result;
    existing.resultId = resultId;
    existing.expiresAt = Date.now() + ttlMs;
  }

  async release(idempotencyKey: string): Promise<void> {
    const existing = this.rows.get(idempotencyKey);
    if (existing?.state === 'pending') this.rows.delete(idempotencyKey);
  }

  async findByKey(idempotencyKey: string, sid: string): Promise<Reservation> {
    const existing = this.rows.get(idempotencyKey);
    if (!existing || existing.sid !== sid || existing.expiresAt <= Date.now()) {
      return { state: 'gone', resultId: null, result: null };
    }
    return { state: existing.state === 'ready' ? 'ready' : 'pending', resultId: existing.resultId, result: existing.result };
  }

  async readResult(resultId: string, sid: string): Promise<ReadOutcome> {
    for (const row of this.rows.values()) {
      if (row.resultId !== resultId) continue;
      if (row.sid !== sid || row.state !== 'ready') return { status: 'not_found' };
      if (row.expiresAt <= Date.now()) return { status: 'expired' };
      return { status: 'ok', result: row.result as SellerSafeResult, expiresAt: row.expiresAt };
    }
    return { status: 'not_found' };
  }

  async healthy(): Promise<boolean> {
    return true;
  }

  reset() {
    this.buckets.clear();
    this.cooldowns.clear();
    this.rows.clear();
  }
}

// ── Selection ───────────────────────────────────────────────────────────────

function connectionString(): string {
  return String(process.env.OFFERR_PREVIEW_STATE_DATABASE_URL ?? '').trim();
}

/**
 * True when a durable store is mandatory. Any deployed environment qualifies —
 * a Vercel preview is multi-instance too, so "it's only a preview" is not a
 * reason to accept per-instance state.
 */
export function durableStoreRequired(): boolean {
  return Boolean(process.env.VERCEL) || isProductionDeployment();
}

let instance: PreviewStore | null = null;

export function getPreviewStore(): PreviewStore {
  if (instance) return instance;
  const url = connectionString();
  if (url) {
    instance = new PostgresStore(url);
    return instance;
  }
  if (durableStoreRequired()) {
    // Fail closed rather than silently degrade to per-instance counters.
    throw new StoreUnavailableError('OFFERR_PREVIEW_STATE_DATABASE_URL is not configured');
  }
  instance = new MemoryStore();
  return instance;
}

/** Test seam: inject a store, or reset to re-select from the environment. */
export function __setPreviewStoreForTests(store: PreviewStore | null) {
  instance = store;
}

export function __newMemoryStoreForTests(): PreviewStore & { reset(): void } {
  return new MemoryStore();
}
