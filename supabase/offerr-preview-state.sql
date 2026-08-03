-- =====================================================================
-- Offerr preview state — distributed rate limiting, single-flight
-- idempotency, and durable seller-safe result storage.
-- =====================================================================
--
-- WHY THIS EXISTS
-- ---------------
-- The closed preview originally kept rate-limit counters, the idempotency
-- single-flight map, and the seller-safe result store in process memory. On
-- serverless that is per-instance: limits dilute across concurrently-warm
-- instances, a double submit routed to two instances runs two evaluations, and
-- a result becomes unreadable the moment the instance that produced it is
-- recycled. This schema replaces all three with state that every instance
-- shares.
--
-- OWNERSHIP AND ISOLATION
-- -----------------------
-- Everything lives in its own `offerr_preview` schema, entirely separate from
-- the Offerr evaluation spine (public.offerr_*). That separation is deliberate:
-- this is the PUBLIC SURFACE's own state, owned by the standalone OfferrAI app,
-- and it must be droppable without touching the acquisition backend. Nothing
-- here is read or written by rei-automation.
--
-- PRIVILEGE POSTURE
-- -----------------
-- anon and authenticated get NOTHING — not usage on the schema, not select on
-- any table. The only caller is the OfferrAI server holding the service role.
-- These rows contain a seller-safe projection and pseudonymous identifiers, but
-- "seller-safe to show its owner" is not "safe for the whole internet", so the
-- surface is closed rather than merely policy-restricted.
--
-- NO SELLER PII
-- -------------
-- Rate-limit keys are salted HMACs of the client IP or the signed session id —
-- never a raw address, email or phone. Result rows hold only the seller-safe
-- projection that the browser is already permitted to see.

CREATE SCHEMA IF NOT EXISTS offerr_preview;

REVOKE ALL ON SCHEMA offerr_preview FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA offerr_preview TO service_role;

-- ---------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------
-- One row per (rule, pseudonymous subject). `reset_at` is the end of the
-- current fixed window; a request arriving after it starts a new window.
CREATE TABLE IF NOT EXISTS offerr_preview.rate_buckets (
  key        text PRIMARY KEY,
  count      integer     NOT NULL DEFAULT 0,
  reset_at   timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sweeping is by expiry, so the sweep must not seq-scan the whole table.
CREATE INDEX IF NOT EXISTS idx_offerr_preview_rate_reset
  ON offerr_preview.rate_buckets (reset_at);

-- ---------------------------------------------------------------------
-- Per-property cooldown
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offerr_preview.cooldowns (
  key      text PRIMARY KEY,
  until    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_offerr_preview_cooldowns_until
  ON offerr_preview.cooldowns (until);

-- ---------------------------------------------------------------------
-- Results + single-flight reservations
-- ---------------------------------------------------------------------
-- One row per server-derived idempotency key. The row is created in state
-- 'pending' BEFORE the upstream call, which is what makes the reservation a
-- distributed single-flight rather than a cache: the loser of the race sees the
-- pending row and waits for the winner instead of starting a second evaluation.
--
-- `sid` binds the row to the session that created it. A result id alone is
-- never sufficient to read a result.
CREATE TABLE IF NOT EXISTS offerr_preview.results (
  idempotency_key text PRIMARY KEY,
  result_id       text        NOT NULL UNIQUE,
  sid             text        NOT NULL,
  state           text        NOT NULL CHECK (state IN ('pending', 'ready')),
  result          jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  -- A 'pending' row must never wedge the key forever if the instance holding it
  -- dies mid-call. This is the reservation lease, not the result TTL.
  lease_until     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_offerr_preview_results_sid
  ON offerr_preview.results (sid);
CREATE INDEX IF NOT EXISTS idx_offerr_preview_results_expires
  ON offerr_preview.results (expires_at);

ALTER TABLE offerr_preview.rate_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE offerr_preview.cooldowns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE offerr_preview.results      ENABLE ROW LEVEL SECURITY;

-- No policies are defined on purpose. RLS with zero policies denies everyone
-- except table owners and BYPASSRLS roles, so anon/authenticated cannot read a
-- row even if a future grant is added by mistake.

REVOKE ALL ON ALL TABLES IN SCHEMA offerr_preview FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON offerr_preview.rate_buckets, offerr_preview.cooldowns, offerr_preview.results
  TO service_role;

-- ---------------------------------------------------------------------
-- rate_consume — atomic fixed-window counter
-- ---------------------------------------------------------------------
-- INSERT .. ON CONFLICT DO UPDATE takes a row-level lock, so two concurrent
-- callers serialize on the same key and the returned count is exact. Doing this
-- as read-then-write in application code would race and let both callers pass a
-- limit of one.
CREATE OR REPLACE FUNCTION offerr_preview.rate_consume(
  p_key       text,
  p_limit     integer,
  p_window_ms integer
)
RETURNS TABLE (allowed boolean, remaining integer, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = offerr_preview, pg_temp
AS $$
DECLARE
  v_now      timestamptz := clock_timestamp();
  v_window   interval    := make_interval(secs => p_window_ms / 1000.0);
  v_count    integer;
  v_reset_at timestamptz;
BEGIN
  INSERT INTO offerr_preview.rate_buckets AS b (key, count, reset_at, updated_at)
  VALUES (p_key, 1, v_now + v_window, v_now)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE WHEN b.reset_at <= v_now THEN 1 ELSE b.count + 1 END,
        reset_at = CASE WHEN b.reset_at <= v_now THEN v_now + v_window ELSE b.reset_at END,
        updated_at = v_now
  RETURNING b.count, b.reset_at INTO v_count, v_reset_at;

  IF v_count > p_limit THEN
    RETURN QUERY SELECT
      false,
      0,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_reset_at - v_now)))::integer);
  ELSE
    RETURN QUERY SELECT true, GREATEST(0, p_limit - v_count), 0;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- cooldown_check / cooldown_mark
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION offerr_preview.cooldown_check(p_key text)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = offerr_preview, pg_temp
AS $$
DECLARE
  v_now   timestamptz := clock_timestamp();
  v_until timestamptz;
BEGIN
  SELECT c.until INTO v_until FROM offerr_preview.cooldowns c WHERE c.key = p_key;
  IF v_until IS NOT NULL AND v_until > v_now THEN
    RETURN QUERY SELECT false, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_until - v_now)))::integer);
  ELSE
    RETURN QUERY SELECT true, 0;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION offerr_preview.cooldown_mark(p_key text, p_ms integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = offerr_preview, pg_temp
AS $$
  INSERT INTO offerr_preview.cooldowns (key, until)
  VALUES (p_key, clock_timestamp() + make_interval(secs => p_ms / 1000.0))
  ON CONFLICT (key) DO UPDATE SET until = EXCLUDED.until;
$$;

-- ---------------------------------------------------------------------
-- reserve — distributed single-flight
-- ---------------------------------------------------------------------
-- Returns won=true to exactly one caller per idempotency key while a
-- reservation is live. Everyone else gets won=false plus the current state, and
-- waits. An expired lease is reclaimable so a crashed instance cannot wedge the
-- key until its TTL.
CREATE OR REPLACE FUNCTION offerr_preview.reserve(
  p_idempotency_key text,
  p_sid             text,
  p_result_id       text,
  p_ttl_ms          integer,
  p_lease_ms        integer
)
RETURNS TABLE (won boolean, state text, result_id text, result jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = offerr_preview, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_row offerr_preview.results%ROWTYPE;
BEGIN
  INSERT INTO offerr_preview.results AS r
    (idempotency_key, result_id, sid, state, result, created_at, expires_at, lease_until)
  VALUES
    (p_idempotency_key, p_result_id, p_sid, 'pending', NULL, v_now,
     v_now + make_interval(secs => p_ttl_ms / 1000.0),
     v_now + make_interval(secs => p_lease_ms / 1000.0))
  ON CONFLICT (idempotency_key) DO UPDATE
    -- Reclaim only a dead reservation: still pending, and its lease has lapsed.
    SET result_id   = EXCLUDED.result_id,
        sid         = EXCLUDED.sid,
        created_at  = EXCLUDED.created_at,
        expires_at  = EXCLUDED.expires_at,
        lease_until = EXCLUDED.lease_until
    WHERE r.state = 'pending'
      AND r.lease_until IS NOT NULL
      AND r.lease_until <= v_now
  RETURNING r.* INTO v_row;

  IF FOUND THEN
    RETURN QUERY SELECT true, v_row.state, v_row.result_id, v_row.result;
    RETURN;
  END IF;

  -- Lost the race (or the row is ready): report the incumbent.
  SELECT * INTO v_row FROM offerr_preview.results r2
   WHERE r2.idempotency_key = p_idempotency_key;

  IF NOT FOUND THEN
    -- The incumbent expired and was swept between our INSERT and this SELECT.
    RETURN QUERY SELECT false, 'gone'::text, NULL::text, NULL::jsonb;
    RETURN;
  END IF;

  -- Cross-session denial happens here too: another session's reservation is
  -- reported as 'gone', never as a readable result.
  IF v_row.sid IS DISTINCT FROM p_sid THEN
    RETURN QUERY SELECT false, 'gone'::text, NULL::text, NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, v_row.state, v_row.result_id, v_row.result;
END;
$$;

-- ---------------------------------------------------------------------
-- complete / release
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION offerr_preview.complete(
  p_idempotency_key text,
  p_result_id       text,
  p_result          jsonb,
  p_ttl_ms          integer
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = offerr_preview, pg_temp
AS $$
  UPDATE offerr_preview.results
     SET state = 'ready',
         result = p_result,
         result_id = p_result_id,
         lease_until = NULL,
         expires_at = clock_timestamp() + make_interval(secs => p_ttl_ms / 1000.0)
   WHERE idempotency_key = p_idempotency_key;
$$;

-- A retryable failure must NOT be cached: releasing the reservation deletes the
-- pending row so an immediate retry re-evaluates instead of replaying a
-- failure for the whole result TTL.
CREATE OR REPLACE FUNCTION offerr_preview.release(p_idempotency_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = offerr_preview, pg_temp
AS $$
  DELETE FROM offerr_preview.results
   WHERE idempotency_key = p_idempotency_key AND state = 'pending';
$$;

-- ---------------------------------------------------------------------
-- read_result — session-bound retrieval
-- ---------------------------------------------------------------------
-- A row belonging to a different session is reported 'not_found', identical to
-- an id that never existed, so this cannot probe for another seller's result.
CREATE OR REPLACE FUNCTION offerr_preview.read_result(p_result_id text, p_sid text)
RETURNS TABLE (status text, result jsonb, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = offerr_preview, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_row offerr_preview.results%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM offerr_preview.results r WHERE r.result_id = p_result_id;

  IF NOT FOUND OR v_row.sid IS DISTINCT FROM p_sid OR v_row.state <> 'ready' THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::jsonb, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_row.expires_at <= v_now THEN
    RETURN QUERY SELECT 'expired'::text, NULL::jsonb, NULL::timestamptz;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'ok'::text, v_row.result, v_row.expires_at;
END;
$$;

-- ---------------------------------------------------------------------
-- find_by_idempotency_key — replay lookup
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION offerr_preview.find_by_key(p_idempotency_key text, p_sid text)
RETURNS TABLE (state text, result_id text, result jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = offerr_preview, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_row offerr_preview.results%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM offerr_preview.results r
   WHERE r.idempotency_key = p_idempotency_key;

  IF NOT FOUND OR v_row.sid IS DISTINCT FROM p_sid OR v_row.expires_at <= v_now THEN
    RETURN QUERY SELECT 'none'::text, NULL::text, NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_row.state, v_row.result_id, v_row.result;
END;
$$;

-- ---------------------------------------------------------------------
-- sweep — bounded housekeeping
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION offerr_preview.sweep()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = offerr_preview, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_deleted integer := 0;
  v_n integer;
BEGIN
  DELETE FROM offerr_preview.rate_buckets WHERE reset_at <= v_now - interval '1 hour';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deleted := v_deleted + v_n;
  DELETE FROM offerr_preview.cooldowns WHERE until <= v_now - interval '1 hour';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deleted := v_deleted + v_n;
  DELETE FROM offerr_preview.results WHERE expires_at <= v_now - interval '1 hour';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deleted := v_deleted + v_n;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA offerr_preview FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA offerr_preview TO service_role;

DO $$
BEGIN
  RAISE NOTICE 'Offerr preview state schema OK — 3 tables, 8 functions, anon/authenticated denied.';
END;
$$;
