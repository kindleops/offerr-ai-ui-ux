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

import { getVercelOidcToken } from '@vercel/oidc';

import { internalEvaluationConfig, isProductionDeployment } from './preview-config.ts';
import type { InternalEvaluationView } from './outcomes.ts';
import { parseUpstreamEnvelope } from './upstream-contract.ts';
import type { OutboundSellerFacts } from './seller-facts-contract.ts';
import { syntheticEvaluate } from './synthetic-evaluator.ts';

export interface UpstreamRequest {
  address: string;
  idempotencyKey: string;
  /**
   * Typed to the mirrored spine contract rather than a loose record, so a field
   * the spine has no contract for cannot be added to the outbound payload
   * without a compile error. The runtime check in the intake route is the second
   * layer, for values the type system cannot see.
   */
  sellerFacts: OutboundSellerFacts;
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
 * Hosts that must never receive a request from this adapter, whatever the
 * configuration says. A misconfigured base URL should fail loudly rather than
 * ship the internal secret somewhere it does not belong.
 */
const DENIED_HOST_PATTERNS: RegExp[] = [
  /\.supabase\.co$/i, // the database, never an evaluation endpoint
  /\.supabase\.in$/i,
  /^localhost$/i,
  /^127\./,
  /^\[?::1\]?$/,
  /^0\.0\.0\.0$/,
  /\.internal$/i,
  /^169\.254\./, // link-local / cloud metadata
];

/**
 * Transport security and host allowlist.
 *
 * A secret-bearing request must not leave the process over plaintext, and it
 * must not go to a host that merely *looks* configured. `OFFERR_INTERNAL_API_ALLOWED_HOST`
 * pins the exact expected hostname; when set, anything else is refused even if
 * `OFFERR_INTERNAL_API_BASE` was changed. That turns an env-var mistake — or an
 * injected value — into a refusal rather than a credential disclosure.
 *
 * `localhost` stays reachable for the local suite, and only when this is not a
 * deployed environment.
 */
export function transportAllowed(baseUrl: string, allowedHost = ''): boolean {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return false;
  }

  const host = url.hostname;
  const deployed = Boolean(process.env.VERCEL) || isProductionDeployment();

  // Explicit pin wins over every other consideration.
  const pinned = String(allowedHost ?? '').trim().toLowerCase();
  if (pinned && host.toLowerCase() !== pinned) return false;

  if (url.protocol === 'https:') {
    // A deployed adapter may never talk to a loopback or metadata address.
    if (deployed && DENIED_HOST_PATTERNS.some((p) => p.test(host))) return false;
    return true;
  }

  if (url.protocol !== 'http:') return false;
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  return local && !deployed;
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

  // Vercel Trusted Sources: the calling project forwards its short-lived OIDC
  // token and the destination verifies it against its trusted-source list. This
  // is the credential we WANT to be authenticating with — it is scoped to this
  // project and environment and expires in an hour, unlike a static bypass
  // secret. It is attached whenever the runtime can mint one, so the adapter
  // starts using it the moment Trusted Sources is configured on the backend,
  // with no code change. Never logged, never returned, never sent anywhere but
  // the allowlisted host.
  let oidcToken = '';
  try {
    oidcToken = (await getVercelOidcToken()) ?? '';
  } catch {
    // No OIDC in this runtime (local, or federation disabled). The bypass
    // header below still authenticates the hop.
    oidcToken = '';
  }

  // The bypass travels ONLY as a header. Vercel also accepts it as a query
  // parameter, but that form makes the edge answer with a redirect to strip the
  // parameter and set a cookie — and with `redirect: 'error'` (which we keep,
  // so a credential is never replayed to another host) the fetch throws AFTER
  // the backend has already processed the request. That produced a phantom
  // failure: a real evaluation persisted upstream while the seller was told the
  // system was unavailable. A credential also has no business in a URL, where
  // it lands in access logs.
  const target = `${config.baseUrl.replace(/\/+$/, '')}/api/internal/offerr/evaluations`;

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
          // Vercel Trusted Sources — preferred. Scoped and short-lived.
          ...(oidcToken ? { 'x-vercel-trusted-oidc-idp-token': oidcToken } : {}),
          // Automation bypass — only when the backend is a protected preview.
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
      // The route reports engine failures in `failure_code` but VALIDATION
      // failures in `error` (with `validation_errors`). Reading only the former
      // turned a precise 400 into a generic "unavailable", which is how a
      // seller-facts contract mismatch stayed invisible: the seller was told to
      // retry a submission the backend would reject identically every time.
      const failureCode = normalizeFailureCode(payload?.failure_code ?? payload?.error);
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
    if (!transportAllowed(config.baseUrl, config.allowedHost)) {
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
