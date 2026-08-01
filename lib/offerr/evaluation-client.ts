/**
 * Upstream evaluation client — SERVER ONLY.
 *
 * This is the ONLY module that knows `OFFERR_INTERNAL_API_SECRET` exists. It is
 * read from the environment at call time, sent as a request header to the
 * internal route, and never returned, logged, or included in any value that
 * reaches a response body.
 *
 * The public boundary calls THIS; the browser calls the public boundary. The
 * internal secret-protected route is never exposed as a public endpoint and its
 * URL never reaches the client.
 */

import 'server-only';

import { internalEvaluationConfig } from './preview-config.ts';
import type { InternalEvaluationView } from './outcomes.ts';
import { syntheticEvaluate } from './synthetic-evaluator.ts';

export interface UpstreamRequest {
  address: string;
  idempotencyKey: string;
  sellerFacts: Record<string, unknown>;
  correlationId: string;
}

/**
 * Call the internal Offerr evaluation route.
 *
 * Every failure mode collapses into an `InternalEvaluationView` with
 * `ok: false` and a code the seller-safe mapper understands. Upstream error
 * bodies, stack traces and status text are never propagated — the caller gets a
 * classification, not a diagnosis.
 */
export async function evaluateUpstream(request: UpstreamRequest): Promise<InternalEvaluationView> {
  const config = internalEvaluationConfig();

  // Preview-only synthetic path. Gated on a non-production deployment inside
  // `internalEvaluationConfig()`, so it cannot be switched on in production by
  // environment variable alone.
  if (config.syntheticEnabled) {
    return syntheticEvaluate(request);
  }

  if (!config.baseUrl || !config.secret) {
    // Not configured is not an error the seller caused, and it must not read as
    // "your property could not be found".
    return { ok: false, failureCode: 'upstream_unavailable' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/api/internal/offerr/evaluations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Server-to-server only. This header never exists in a browser request.
        'x-internal-api-secret': config.secret,
        'x-correlation-id': request.correlationId,
      },
      body: JSON.stringify({
        address: request.address,
        idempotency_key: request.idempotencyKey,
        seller_facts: request.sellerFacts,
        source: 'offerr_public_preview',
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    // 423 is the internal route's documented "feature disabled" response.
    if (response.status === 423) return { ok: false, failureCode: 'offerr_disabled' };
    if (response.status === 401 || response.status === 403) {
      return { ok: false, failureCode: 'upstream_unavailable' };
    }

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok || !payload || payload.ok !== true) {
      const failureCode =
        typeof payload?.failure_code === 'string' ? payload.failure_code : 'upstream_unavailable';
      return { ok: false, failureCode };
    }

    const evaluation = (payload.evaluation ?? null) as InternalEvaluationView['projection'];
    return {
      ok: true,
      outcome: (evaluation as { outcome?: string } | null)?.outcome ?? (payload.outcome as string) ?? null,
      projection: evaluation,
    };
  } catch (error) {
    const aborted = (error as { name?: string })?.name === 'AbortError';
    return { ok: false, failureCode: aborted ? 'evaluation_timeout' : 'upstream_unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
