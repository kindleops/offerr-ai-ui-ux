/**
 * Runtime contract for the internal evaluation response — SERVER ONLY.
 *
 * WHY A RUNTIME CONTRACT AND NOT A TYPE
 * -------------------------------------
 * The upstream service is a different repository on a different deploy cadence.
 * A TypeScript interface describes what we BELIEVE it returns; it disappears at
 * runtime and enforces nothing. If the backend starts attaching underwriting
 * internals to its seller projection — a MAO, an assignment fee, a comp set, a
 * buyer entity — a compile-time type would not notice and the boundary would
 * happily forward them.
 *
 * So the response is validated at runtime, in two directions:
 *
 *   1. ALLOWLIST (positive): the seller-safe view is rebuilt field by field from
 *      values we recognise. Anything not named is simply not carried across.
 *   2. DENYLIST (negative, fail-closed): the ENTIRE payload — at any depth — is
 *      scanned for privileged field names. If one is present the response is
 *      rejected outright rather than projected.
 *
 * The denylist exists because the allowlist alone silently tolerates a backend
 * that has started leaking. Rejecting loudly turns a data-exposure regression
 * into a visible failure the preview surfaces as "unavailable", which is the
 * safe direction to fail.
 */

import 'server-only';

/**
 * Field names that must never appear anywhere in an upstream response destined
 * for a seller. Matched case-insensitively against every key at every depth.
 *
 * These are drawn from the internal evaluation spine's own vocabulary: the
 * underwriting figures, the comp corpus, buyer demand, execution state, the
 * internal identifiers, and the reason codes that describe internal logic.
 */
export const FORBIDDEN_UPSTREAM_KEYS: readonly string[] = [
  // Underwriting economics
  'mao', 'max_allowable_offer', 'assignment_fee', 'margin', 'spread', 'profit',
  'target_margin', 'offer_price', 'internal_valuation', 'arv',
  // Comp corpus
  'comps', 'comp_set', 'comparables', 'comp_candidates', 'candidates',
  'buyer_comp_raw', 'comp_rows', 'comp_count',
  // Buyer demand
  'buyer_entities', 'buyers', 'buyer_demand', 'buyer_id', 'buyer_name',
  // Internal state and provenance
  'internal_result', 'provenance', 'execution_state', 'acquisition_score',
  'acquisition_state', 'suppression', 'suppression_state', 'risk_score',
  'underwriting', 'internal_reason_code', 'reason_code', 'failure_reason',
  'timeout_stage', 'stack', 'stacktrace', 'query', 'sql',
] as const;

/**
 * Internal identifiers and operational metadata that the internal route
 * legitimately returns and that must NEVER reach a seller.
 *
 * These are STRIPPED, not treated as drift. The distinction matters: the
 * documented envelope carries `request_id` and `evaluation_id`, so rejecting
 * the response for containing them would mean rejecting every successful
 * evaluation — the boundary would fail closed permanently and no seller would
 * ever see a result. Their presence is expected; forwarding them is what would
 * be wrong, and the allowlist projection below never does.
 *
 * `FORBIDDEN_UPSTREAM_KEYS` stays reserved for fields whose presence is
 * genuinely evidence of a leak — underwriting figures, the comp corpus, buyer
 * demand, execution state — because those have no business in a seller
 * projection under any version of the contract.
 *
 * The seller's own opaque handle is the result id minted by this app, which is
 * unrelated to any upstream identifier.
 */
export const STRIPPED_UPSTREAM_KEYS: readonly string[] = [
  'request_id', 'evaluation_id', 'property_id', 'property_export_id',
  'internal_property_id', 'row_id', 'db_id', 'tenant_id',
  'processing_ms', 'spine_version', 'idempotent_replay', 'route',
] as const;

const FORBIDDEN = new Set(FORBIDDEN_UPSTREAM_KEYS.map((k) => k.toLowerCase()));

/** Depth/size caps so a hostile payload cannot make the scan itself the attack. */
const MAX_SCAN_DEPTH = 12;
const MAX_SCAN_NODES = 5_000;

export interface ContractViolation {
  ok: false;
  violation: 'forbidden_field' | 'malformed' | 'too_complex';
  /** The offending key NAME only — never its value. */
  field: string | null;
}

/**
 * Deep scan for privileged keys. Returns the first offending key name, or null.
 * Values are never returned or logged: the key name is enough to diagnose a
 * contract regression and carries no seller or internal data.
 */
export function findForbiddenKey(payload: unknown): { key: string | null; tooComplex: boolean } {
  let nodes = 0;

  function walk(node: unknown, depth: number): string | null {
    if (node === null || typeof node !== 'object') return null;
    if (depth > MAX_SCAN_DEPTH) return null;
    if ((nodes += 1) > MAX_SCAN_NODES) return null;

    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = walk(item, depth + 1);
        if (hit) return hit;
      }
      return null;
    }

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (FORBIDDEN.has(key.toLowerCase())) return key;
      const hit = walk(value, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  const key = walk(payload, 0);
  return { key, tooComplex: nodes > MAX_SCAN_NODES };
}

/** The only shape the seller projection is allowed to contribute. */
export interface UpstreamProjection {
  preliminary_range: { low: number; high: number } | null;
  next_step: string | null;
  expires_at: string | null;
  confidence: string | null;
}

export interface UpstreamEnvelope {
  ok: true;
  outcome: string | null;
  projection: UpstreamProjection;
  /** Upstream's own idempotent-replay signal, if it reported one. */
  idempotentReplay: boolean;
}

function str(value: unknown, max = 120): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function isoOrNull(value: unknown): string | null {
  const s = str(value, 40);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function rangeOrNull(value: unknown): { low: number; high: number } | null {
  if (!value || typeof value !== 'object') return null;
  const low = Number((value as { low?: unknown }).low);
  const high = Number((value as { high?: unknown }).high);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (low <= 0 || high <= 0 || high < low) return null;
  // A preliminary band wider than this is not a range, it is an admission of
  // ignorance; treating it as a usable answer would mislead the seller.
  if (high > low * 10) return null;
  return { low, high };
}

/**
 * Validate an upstream success payload and rebuild the seller-relevant view
 * from allowlisted fields only.
 *
 * Fails closed on any forbidden key ANYWHERE in the payload, including inside
 * parts of the response this projection would otherwise ignore.
 */
export function parseUpstreamEnvelope(payload: unknown): UpstreamEnvelope | ContractViolation {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, violation: 'malformed', field: null };
  }

  const scan = findForbiddenKey(payload);
  if (scan.tooComplex) return { ok: false, violation: 'too_complex', field: null };
  if (scan.key) return { ok: false, violation: 'forbidden_field', field: scan.key };

  const body = payload as Record<string, unknown>;
  const evaluation = (body.evaluation ?? null) as Record<string, unknown> | null;

  const projectionSource = evaluation && typeof evaluation === 'object' ? evaluation : {};

  return {
    ok: true,
    outcome: str(projectionSource.outcome) ?? str(body.outcome),
    projection: {
      preliminary_range: rangeOrNull(projectionSource.preliminary_range),
      next_step: str(projectionSource.next_step, 64),
      expires_at: isoOrNull(projectionSource.expires_at),
      // The spine emits `confidence_label` (e.g. "LOW"); `confidence` is
      // accepted too so a rename upstream does not silently blank the field.
      confidence: str(projectionSource.confidence_label, 40) ?? str(projectionSource.confidence, 40),
    },
    idempotentReplay: body.idempotent_replay === true,
  };
}

/**
 * Seller-safe result keys. Asserted by tests against the object that actually
 * reaches the browser, so a new field cannot be added to `SellerSafeResult`
 * without a deliberate decision to expose it.
 */
export const SELLER_SAFE_RESULT_KEYS: readonly string[] = [
  'outcome', 'range', 'confidence', 'headline', 'body', 'detail', 'assumptions',
  'nextStep', 'expiresAt', 'binding', 'disclaimer', 'retryable', 'supportCode',
] as const;

/**
 * Final egress check. Anything whose key is not on the seller-safe list is
 * dropped, and any forbidden key causes an outright rejection.
 *
 * This runs on the object about to be serialized to the browser — the last
 * place a leak could still be caught.
 */
export function assertSellerSafe(result: Record<string, unknown>): { ok: boolean; field: string | null } {
  const scan = findForbiddenKey(result);
  if (scan.key) return { ok: false, field: scan.key };
  for (const key of Object.keys(result)) {
    if (!SELLER_SAFE_RESULT_KEYS.includes(key)) return { ok: false, field: key };
  }
  return { ok: true, field: null };
}
