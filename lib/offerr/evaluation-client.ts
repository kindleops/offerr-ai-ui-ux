/**
 * Upstream evaluation adapter — SERVER ONLY.
 *
 * This is the ONLY module that knows `OFFERR_INTERNAL_API_SECRET` exists. It is
 * read from the environment at call time, sent as a request header, and never
 * returned, logged, or included in any value that reaches a response body.
 *
 * The browser calls the public intake boundary; the boundary calls this; this
 * calls the internal route. The internal URL and secret never reach the client,
 * and there is no public path that proxies to the internal route.
 *
 * WHAT CHANGED FROM THE ORIGINAL PREVIEW
 * --------------------------------------
 * The preview originally ran a SYNTHETIC evaluator by default, so no seller
 * outcome had ever been produced by the real engine. The synthetic path is now
 * an explicit TEST FIXTURE adapter: it is selected only when the real adapter is
 * unconfigured AND the deployment is non-production AND the fixture flag is set,
 * and it can never be the runtime once `OFFERR_INTERNAL_API_BASE` is present.
 *
 * RETRY POLICY
 * ------------
 * Only failures the backend classifies as transient are retried, and only once.
 * Validation (400), idempotency conflict (409) and disabled (423) are terminal:
 * retrying them cannot change the answer, and a blind retry on 409 would be an
 * attempt to displace a snapshot that already exists.
 */

import 'server-only';

import { internalEvaluationConfig, isProductionDeployment } from './preview-config.ts';
import type { InternalEvaluationView } from './outcomes.ts';
import { parseUpstreamEnvelope } from './upstream-contract.ts';
import { syntheticEvaluate } from './synthetic-evaluator.ts';

export interface UpstreamRequest {
  address: string;
  idempotencyKey: string;
  sellerFacts: Record<string, unknown>;
  correlationId: string;
}

/** The adapter seam. Unit tests inject a deterministic implementation. */
export type EvaluationAdapter = (request: UpstreamRequest) => Promise<InternalEvaluationView>;

let injectedAdapter: EvaluationAdapter | null = null;

/** Test seam. Passing `null` restores environment-driven selection. */
export function __setEvaluationAdapterForTests(adapter: EvaluationAdapter | null) {
  injectedAdapter = adapter;
}

/**
 * Status codes whose failure is transient. Everything else is terminal — a
 * retry would either produce the same answer or, for 409, attempt to displace
 * an existing snapshot.
 */
const RETRYABLE_STATUS = new Set([502, 503, 504]);

/** Backend failure codes that are safe to retry once. */
const RETRYABLE_FAILURE_CODES = new Set([
  'evaluation_timeout',
  'offerr_persistence_unavailable',
  'offerr_persistence_failed',
  'offerr_idempotency_conflict_retry',
  'offerr_incomplete_snapshot',
]);

/**
 * Failure codes the backend may return that we are willing to act on (mapped to
 * seller-safe copy downstream). Anything else collapses to a generic
 * unavailability — an unrecognised internal code must never influence what a
 * seller is shown, even indirectly through branching.
 */
const KNOWN_FAILURE_CODES = new Set([
  'invalid_offerr_intake',
  'property_not_found',
  'insufficient_data',
  'evaluation_timeout',
  'offerr_persistence_unavailable',
  'offerr_persistence_failed',
  'offerr_idempotency_conflict_retry',
  'offerr_incomplete_snapshot',
  'subject_hydration_error',
  'property_resolution_error',
  'comp_load_error',
  'offerr_disabled',
]);

function normalizeFailureCode(raw: unknown): string {
  const code = typeof raw === 'string' ? raw.trim() : '';
  return KNOWN_FAILURE_CODES.has(code) ? code : 'upstream_unavailable';
}

/**
 * Transport security. A secret-bearing request must not leave the process over
 * plaintext. `localhost` is exempted so the suite can run against a local
 * backend, and only when this is not a deployed environment.
 */
function transportAllowed(baseUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  if (url.protocol !== 'http:') return false;
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  return local && !isProductionDeployment() && !process.env.VERCEL;
}

interface AttemptResult {
  view: InternalEvaluationView;
  retryable: boolean;
}

async function attempt(
  request: UpstreamRequest,
  config: ReturnType<typeof internalEvaluationConfig>,
): Promise<AttemptResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  // Vercel accepts the Deployment Protection bypass as a header OR a query
  // parameter, and which one is honoured varies by how the request reaches the
  // edge. Sending both is the reliable form; neither is present unless the
  // backend is a protected preview.
  const target = new URL(`${config.baseUrl.replace(/\/+$/, '')}/api/internal/offerr/evaluations`);
  if (config.bypassToken) {
    target.searchParams.set('x-vercel-protection-bypass', config.bypassToken);
  }

  try {
    const response = await fetch(
      target,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Server-to-server only. This header never exists in a browser request.
          'x-internal-api-secret': config.secret,
          'x-correlation-id': request.correlationId,
          // Only present when the backend is a protected preview deployment.
          ...(config.bypassToken ? { 'x-vercel-protection-bypass': config.bypassToken } : {}),
        },
        // Only approved seller input crosses. No session id, no cookie, no
        // contact details, no client IP.
        body: JSON.stringify({
          address: request.address,
          idempotency_key: request.idempotencyKey,
          seller_facts: request.sellerFacts,
          source: 'offerr_public_preview',
        }),
        signal: controller.signal,
        cache: 'no-store',
        // A redirect could send the secret header to another host.
        redirect: 'error',
      },
    );

    // Documented terminal states, resolved before any body is parsed.
    if (response.status === 423) {
      return { view: { ok: false, failureCode: 'offerr_disabled' }, retryable: false };
    }
    if (response.status === 401 || response.status === 403) {
      // A misconfigured secret is our problem, not the seller's, and its cause
      // must not be describable from the outside.
      return { view: { ok: false, failureCode: 'upstream_unavailable' }, retryable: false };
    }
    if (response.status === 409 || response.status === 413) {
      return { view: { ok: false, failureCode: 'upstream_unavailable' }, retryable: false };
    }

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok || !payload || payload.ok !== true) {
      const failureCode = normalizeFailureCode(payload?.failure_code);
      const retryable = RETRYABLE_STATUS.has(response.status) || RETRYABLE_FAILURE_CODES.has(failureCode);
      return { view: { ok: false, failureCode }, retryable };
    }

    // Success path: validate the contract before believing any of it.
    const envelope = parseUpstreamEnvelope(payload);
    if (envelope.ok !== true) {
      // A contract violation is a backend regression, not a seller problem, and
      // it is NOT retryable — the same payload would come back. Only the key
      // NAME is carried out; the value never leaves this function.
      return {
        view: { ok: false, failureCode: 'upstream_contract_violation', contractField: envelope.field },
        retryable: false,
      };
    }

    return {
      view: { ok: true, outcome: envelope.outcome, projection: envelope.projection },
      retryable: false,
    };
  } catch (error) {
    const aborted = (error as { name?: string })?.name === 'AbortError';
    return {
      view: { ok: false, failureCode: aborted ? 'evaluation_timeout' : 'upstream_unavailable' },
      // A timeout or a dropped connection is exactly the transient case retry
      // exists for. The idempotency key is unchanged, so a retry cannot create a
      // second snapshot upstream.
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call the internal Offerr evaluation route.
 *
 * Every failure mode collapses into an `InternalEvaluationView` with
 * `ok: false` and a code the seller-safe mapper understands. Upstream error
 * bodies, stack traces, status text and URLs are never propagated — the caller
 * gets a classification, not a diagnosis.
 */
export async function evaluateUpstream(request: UpstreamRequest): Promise<InternalEvaluationView> {
  if (injectedAdapter) return injectedAdapter(request);

  const config = internalEvaluationConfig();

  if (config.baseUrl && config.secret) {
    if (!transportAllowed(config.baseUrl)) {
      // Refuse to send the secret rather than downgrade the transport.
      return { ok: false, failureCode: 'upstream_unavailable' };
    }

    const first = await attempt(request, config);
    if (first.view.ok || !first.retryable) return first.view;

    // Exactly one retry, on the same server-derived idempotency key.
    const second = await attempt(request, config);
    return second.view;
  }

  // No real backend configured. The synthetic fixture is the ONLY remaining
  // option and it is refused unless explicitly enabled on a non-production
  // deployment.
  if (config.syntheticEnabled) return syntheticEvaluate(request);

  return { ok: false, failureCode: 'upstream_unavailable' };
}
