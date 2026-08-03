/**
 * PREVIEW-ONLY synthetic evaluator — SERVER ONLY.
 *
 * WHY THIS EXISTS
 * ---------------
 * The closed preview must be able to exercise every seller-facing outcome
 * state, but the internal evaluation engine is disabled in production and no
 * preview database has been provisioned. Without this, only the "unavailable"
 * branch would ever be reachable and the other states would ship unverified.
 *
 * WHAT IT IS NOT
 * --------------
 * It is not a valuation, not a model, and not a fallback. It never runs unless
 * BOTH `OFFERR_PREVIEW_SYNTHETIC_EVALUATOR=true` AND the deployment is
 * non-production (enforced in `internalEvaluationConfig()`, not here). It reads
 * no property data and contacts nothing.
 *
 * Outcomes are selected DETERMINISTICALLY from the submitted address so the
 * closed test matrix is reproducible. Ranges are round, obviously-synthetic
 * numbers derived from the address hash — they are demonstration values for
 * layout and copy, and the seller-facing wording around them is the same
 * preliminary, non-binding language every real result carries.
 *
 * REMOVAL IS A LAUNCH PREREQUISITE. See the preview documentation.
 */

import 'server-only';

import { createHash } from 'node:crypto';
import type { InternalEvaluationView } from './outcomes.ts';
import type { UpstreamRequest } from './evaluation-client.ts';

/**
 * Address substrings that pin a specific outcome, so an operator running the
 * test matrix can reach any state on demand. Checked before the hash fallback.
 */
const SCENARIO_TRIGGERS: Array<[RegExp, () => InternalEvaluationView]> = [
  [/\bunsupported\b|\bcommercial\b|\bwarehouse\b/i, () => ({ ok: true, outcome: 'NOT_ELIGIBLE' })],
  [/\breview\b|\bmanual\b/i, () => ({ ok: true, outcome: 'REVIEW_REQUIRED' })],
  [/\bambiguous\b|\bduplicate\b/i, () => ({
    ok: true,
    outcome: 'REVIEW_REQUIRED',
    projection: { next_step: 'confirm_property_address' },
  })],
  [/\bnounit\b|\bmissing unit\b/i, () => ({
    ok: true,
    outcome: 'REVIEW_REQUIRED',
    projection: { next_step: 'confirm_unit' },
  })],
  [/\bnotfound\b|\bnomatch\b/i, () => ({ ok: false, failureCode: 'property_not_found' })],
  [/\bthin\b|\binsufficient\b/i, () => ({ ok: false, failureCode: 'insufficient_data' })],
  [/\btimeout\b/i, () => ({ ok: false, failureCode: 'evaluation_timeout' })],
  [/\bdbfail\b|\bretryable\b/i, () => ({ ok: false, failureCode: 'offerr_persistence_unavailable' })],
  [/\bconditional\b|\bconflict\b/i, () => ({
    ok: true,
    outcome: 'CONDITIONAL_RANGE',
    projection: null,
  })],
];

function addressHash(address: string): number {
  const digest = createHash('sha256').update(address.trim().toLowerCase()).digest();
  return digest.readUInt32BE(0);
}

function syntheticRange(address: string) {
  const h = addressHash(address);
  // Round, obviously-demonstrative numbers in a plausible band.
  const base = 140_000 + (h % 260) * 1_000;
  const spread = 15_000 + (h % 12) * 1_000;
  return { low: base - spread, high: base + spread };
}

export function syntheticEvaluate(request: UpstreamRequest): InternalEvaluationView {
  const address = request.address ?? '';

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  for (const [pattern, build] of SCENARIO_TRIGGERS) {
    if (pattern.test(address)) {
      const view = build();
      // Conditional/eligible scenarios still need a range attached.
      if (view.ok && (view.outcome === 'CONDITIONAL_RANGE' || view.outcome === 'INSTANT_RANGE_ELIGIBLE')) {
        return {
          ...view,
          projection: {
            ...(view.projection ?? {}),
            preliminary_range: syntheticRange(address),
            expires_at: expiresAt,
          },
        };
      }
      return view;
    }
  }

  // Default: a clean single-family style result. Seller-claimed poor condition
  // or a major repair level downgrades to conditional, which mirrors how the
  // real engine treats an unverified claim that reduces confidence.
  const facts = request.sellerFacts as Record<string, { value?: unknown }> | undefined;
  const condition = String(facts?.condition?.value ?? '');
  const repairs = String((facts?.repairs?.value as { level?: string } | undefined)?.level ?? '');
  const conditional = condition === 'poor' || repairs === 'major';

  return {
    ok: true,
    outcome: conditional ? 'CONDITIONAL_RANGE' : 'INSTANT_RANGE_ELIGIBLE',
    projection: {
      preliminary_range: syntheticRange(address),
      expires_at: expiresAt,
      next_step: null,
    },
  };
}
