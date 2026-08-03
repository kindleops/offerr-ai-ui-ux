/**
 * Offerr closed-preview gates — SERVER ONLY.
 *
 * This module must never be imported from a client component. It reads
 * server-only environment variables, and nothing it returns is safe to
 * serialize into a page payload beyond the coarse booleans exposed by
 * `publicGateSummary()`.
 *
 * THREE INDEPENDENT GATES
 * -----------------------
 * The public seller surface must NOT become reachable merely because the
 * internal evaluation engine is later switched on. They are separate controls
 * with separate owners:
 *
 *   1. `offerr_evaluation_enabled`   — the INTERNAL engine flag, owned by the
 *                                      rei-automation system_control table.
 *                                      This app cannot read or set it; the
 *                                      internal route answers 423 when it is
 *                                      off, and we map that to a seller-safe
 *                                      "unavailable" state.
 *   2. `OFFERR_PUBLIC_INTAKE_ENABLED` — the PUBLIC surface gate, owned here.
 *   3. `OFFERR_PREVIEW_ACCESS_TOKEN`  — the closed-preview admission control.
 *
 * All three must pass before a seller can submit anything.
 *
 * PRODUCTION IS HARD-OFF
 * ----------------------
 * `isProductionDeployment()` is checked first and cannot be overridden by any
 * request-controlled value. Even if every environment variable were set
 * correctly, a production deployment refuses. This is deliberate belt-and-
 * braces: the preview must be incapable of becoming a public launch by
 * configuration drift alone.
 */

import 'server-only';

export const PUBLIC_INTAKE_FLAG = 'offerr_public_intake_enabled';

export type GateFailure =
  | 'production_deployment'
  | 'public_intake_disabled'
  | 'preview_access_not_configured'
  | 'preview_access_denied';

export interface GateResult {
  ok: boolean;
  failure: GateFailure | null;
}

function env(name: string): string {
  return String(process.env[name] ?? '').trim();
}

function isTrue(name: string): boolean {
  return env(name).toLowerCase() === 'true';
}

/**
 * True on a production deployment. Vercel sets VERCEL_ENV to
 * production/preview/development; NODE_ENV alone is not sufficient because a
 * preview deployment also builds with NODE_ENV=production.
 */
export function isProductionDeployment(): boolean {
  const vercelEnv = env('VERCEL_ENV');
  if (vercelEnv) return vercelEnv === 'production';
  // No Vercel context (local, self-hosted): fall back to NODE_ENV, and treat
  // an unrecognised value as production. Unknown means unsafe.
  return env('NODE_ENV') === 'production';
}

/** The public surface gate. Independent of the internal engine flag. */
export function isPublicIntakeEnabled(): boolean {
  return isTrue('OFFERR_PUBLIC_INTAKE_ENABLED');
}

/**
 * Constant-time string comparison. A plain `===` on a secret leaks its prefix
 * length through timing; the preview token is low-value but the habit is not
 * negotiable in an auth path.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Evaluate every gate for a request carrying `presentedToken` (from the
 * preview cookie or the `?access=` query parameter on first arrival).
 *
 * Order matters: production is refused before anything else is even consulted.
 */
export function evaluateGates(presentedToken: string | null | undefined): GateResult {
  if (isProductionDeployment()) {
    return { ok: false, failure: 'production_deployment' };
  }
  if (!isPublicIntakeEnabled()) {
    return { ok: false, failure: 'public_intake_disabled' };
  }

  const expected = env('OFFERR_PREVIEW_ACCESS_TOKEN');
  if (!expected) {
    // Fail CLOSED. An unset token must never mean "no token required" — that
    // is exactly how a closed preview silently becomes an open one.
    return { ok: false, failure: 'preview_access_not_configured' };
  }

  const presented = String(presentedToken ?? '').trim();
  if (!presented || !safeEqual(presented, expected)) {
    return { ok: false, failure: 'preview_access_denied' };
  }

  return { ok: true, failure: null };
}

/**
 * Coarse, non-secret gate state safe to render into a server component. It
 * deliberately carries no token material and no upstream configuration.
 */
export function publicGateSummary(presentedToken: string | null | undefined) {
  const gates = evaluateGates(presentedToken);
  return {
    admitted: gates.ok,
    // A denied visitor is told only that the preview is not open to them, never
    // WHICH gate refused — that would let someone probe the configuration.
    reason: gates.ok ? null : ('not_available' as const),
  };
}

/** Server-only upstream configuration for the internal evaluation service. */
export function internalEvaluationConfig() {
  return {
    baseUrl: env('OFFERR_INTERNAL_API_BASE'),
    secret: env('OFFERR_INTERNAL_API_SECRET'),
    /**
     * Preview-only synthetic evaluator. Lets the closed test matrix exercise
     * every seller-facing outcome without the internal engine being enabled
     * anywhere. Refused on production deployments regardless of the flag.
     */
    syntheticEnabled: isTrue('OFFERR_PREVIEW_SYNTHETIC_EVALUATOR') && !isProductionDeployment(),
    timeoutMs: Number(env('OFFERR_INTERNAL_TIMEOUT_MS') || 20_000),
    /**
     * Vercel Deployment Protection bypass for the BACKEND preview.
     *
     * The backend preview sits behind Vercel SSO, which answers 401 to
     * server-to-server calls. This token is the documented automation bypass.
     * It is refused on a production deployment: production must reach a real
     * unprotected backend, never a protected preview via a side door.
     */
    bypassToken: isProductionDeployment() ? '' : env('OFFERR_INTERNAL_BYPASS_TOKEN'),
    /**
     * Exact hostname the adapter is permitted to call. When set, a changed or
     * injected `OFFERR_INTERNAL_API_BASE` is refused rather than followed —
     * an env-var mistake becomes a refusal, not a credential disclosure.
     */
    allowedHost: env('OFFERR_INTERNAL_API_ALLOWED_HOST'),
  };
}
