/**
 * TEMPORARY transport diagnostic — DELETE BEFORE MERGE.
 *
 * Exists to answer one question with evidence rather than inference: when the
 * OfferrAI server calls the protected backend preview, WHICH layer refuses?
 * The seller-facing `unavailable_retryable` collapses six distinct failures
 * into one string, which is correct for a seller and useless for debugging.
 *
 * It probes the upstream with different credential combinations and reports
 * only non-secret metadata:
 *   - HTTP status
 *   - whether Vercel's protection layer answered (vs the application route)
 *   - the backend's own error CODE (app-level, non-secret)
 *   - elapsed ms and exception NAME
 *
 * It never returns or logs: the OIDC token, the bypass secret, the internal API
 * secret, any service-role credential, a seller address, or a full upstream
 * body.
 *
 * Gated behind the same preview-access token as the rest of the surface AND
 * refused outright on a production deployment.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getVercelOidcToken } from '@vercel/oidc';

import { evaluateGates, isProductionDeployment, internalEvaluationConfig } from '@/lib/offerr/preview-config';
import { PREVIEW_TOKEN_COOKIE } from '@/lib/offerr/session';
import { parseUpstreamEnvelope } from '@/lib/offerr/upstream-contract';
import { transportAllowed } from '@/lib/offerr/evaluation-client';
import { getPreviewStore } from '@/lib/offerr/preview-store';
import { runOnceForKey } from '@/lib/offerr/result-store';
import { evaluateUpstream } from '@/lib/offerr/evaluation-client';
import { toSellerSafeResult } from '@/lib/offerr/outcomes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Response headers that describe the protection layer. None carry a secret. */
const SAFE_HEADERS = [
  'content-type',
  'x-vercel-id',
  'x-robots-tag',
  'server',
  'location',
  'set-cookie-names',
];

function classify(status: number, body: Record<string, unknown> | null, text: string): string {
  if (status === 401 && body && typeof body.error === 'object') return 'VERCEL_PROTECTION_REJECTED';
  if (status === 401 && text.includes('vercel_auth_enabled')) return 'VERCEL_PROTECTION_REJECTED';
  if (status === 401 && body && typeof body.error === 'string') return `BACKEND_APP_AUTH_REJECTED:${body.error}`;
  if (status === 423) return 'BACKEND_REACHED_FLAG_DISABLED';
  if (status === 200 && body?.ok === true) return 'BACKEND_REACHED_OK';
  if (status === 200) return 'BACKEND_REACHED_NOT_OK';
  if (status >= 300 && status < 400) return 'REDIRECT';
  if (body && typeof body.route === 'string') return `BACKEND_REACHED_ERROR:${String(body.error ?? '?')}`;
  return `UNCLASSIFIED_${status}`;
}

export async function GET(request: Request) {
  if (isProductionDeployment()) {
    return NextResponse.json({ ok: false, error: 'not_available' }, { status: 404 });
  }
  const cookieStore = await cookies();
  const gate = evaluateGates(cookieStore.get(PREVIEW_TOKEN_COOKIE)?.value);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: 'not_available' }, { status: 404 });
  }

  const config = internalEvaluationConfig();
  const url = new URL(request.url);
  const useQueryBypass = url.searchParams.get('q') === '1';

  let oidc: string | null = null;
  let oidcError: string | null = null;
  try {
    oidc = (await getVercelOidcToken()) ?? null;
  } catch (error) {
    oidcError = (error as Error)?.name ?? 'unknown';
  }

  const base = config.baseUrl.replace(/\/+$/, '');
  const endpoint = `${base}/api/internal/offerr/evaluations`;

  const probes: Array<{ label: string; headers: Record<string, string>; query?: boolean; redirectError?: boolean }> = [
    { label: '1_no_credentials', headers: {} },
    { label: '2_oidc_only', headers: oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {} },
    {
      label: '3_oidc_plus_wrong_secret',
      headers: {
        ...(oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {}),
        'x-internal-api-secret': 'deliberately-wrong-secret-for-probe',
      },
    },
    {
      label: '4_oidc_plus_correct_secret',
      headers: {
        ...(oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {}),
        'x-internal-api-secret': config.secret,
      },
    },
    {
      label: '5_bypass_header_plus_secret',
      headers: {
        ...(config.bypassToken ? { 'x-vercel-protection-bypass': config.bypassToken } : {}),
        'x-internal-api-secret': config.secret,
      },
    },
    {
      label: '6_bypass_query_plus_secret',
      headers: { 'x-internal-api-secret': config.secret },
      query: true,
    },
    {
      // Exactly what the adapter sends: an OIDC token Vercel cannot yet verify
      // (Trusted Sources unconfigured) ALONGSIDE a valid bypass header. If the
      // edge rejects on the unverifiable token instead of falling through to
      // the bypass, this is the probe that shows it.
      label: '7_oidc_plus_bypass_header_plus_secret',
      headers: {
        ...(oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {}),
        ...(config.bypassToken ? { 'x-vercel-protection-bypass': config.bypassToken } : {}),
        'x-internal-api-secret': config.secret,
      },
    },
    {
      // Same as 7 but with redirect: 'error', to separate an edge rejection
      // from a redirect that only throws under the adapter's redirect policy.
      label: '8_adapter_exact_redirect_error',
      headers: {
        ...(oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {}),
        ...(config.bypassToken ? { 'x-vercel-protection-bypass': config.bypassToken } : {}),
        'x-internal-api-secret': config.secret,
      },
      redirectError: true,
    },
  ];

  const results = [];
  for (const probe of probes) {
    if (probe.query && !useQueryBypass) {
      results.push({ probe: probe.label, skipped: 'pass ?q=1 to include the query-param form' });
      continue;
    }
    const target = new URL(endpoint);
    if (probe.query && config.bypassToken) {
      target.searchParams.set('x-vercel-protection-bypass', config.bypassToken);
    }

    const started = Date.now();
    try {
      const response = await fetch(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...probe.headers },
        // A probe payload, never a seller address.
        body: JSON.stringify({
          address: '1 Diagnostic Probe St, Houston, TX 77035',
          idempotency_key: `diag-${probe.label}-${Date.now()}`,
          seller_facts: {},
          source: 'offerr_transport_diagnostic',
        }),
        cache: 'no-store',
        redirect: probe.redirectError ? 'error' : 'manual',
      });

      const text = await response.text();
      let body: Record<string, unknown> | null = null;
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        body = null;
      }

      const headers: Record<string, string> = {};
      for (const name of SAFE_HEADERS) {
        const value = response.headers.get(name);
        if (value) headers[name] = name === 'location' ? value.split('?')[0] : value.slice(0, 80);
      }

      // Run the REAL contract check and report its decision. Key NAMES are
      // schema, not data, so they are safe to surface; values never are.
      let contract: Record<string, unknown> | null = null;
      if (body && body.ok === true) {
        const parsed = parseUpstreamEnvelope(body);
        const evaluation = (body.evaluation ?? null) as Record<string, unknown> | null;
        contract = {
          accepted: parsed.ok === true,
          violation: parsed.ok === true ? null : parsed.violation,
          offendingKey: parsed.ok === true ? null : parsed.field,
          mappedOutcome: parsed.ok === true ? parsed.outcome : null,
          topLevelKeys: Object.keys(body).sort(),
          evaluationKeys: evaluation ? Object.keys(evaluation).sort() : null,
        };
      }

      results.push({
        probe: probe.label,
        status: response.status,
        classification: classify(response.status, body, text),
        contract,
        // Backend application error codes only — these are non-secret by design.
        backendError: typeof body?.error === 'string' ? body.error : null,
        backendRoute: typeof body?.route === 'string' ? body.route : null,
        backendFlagKey: typeof body?.flag_key === 'string' ? body.flag_key : null,
        reachedApplicationRoute: typeof body?.route === 'string' || response.status === 423,
        elapsedMs: Date.now() - started,
        headers,
      });
    } catch (error) {
      results.push({
        probe: probe.label,
        status: null,
        classification: 'THREW',
        errorName: (error as Error)?.name ?? 'Error',
        // Message can contain the URL but never a credential; truncated hard.
        errorHint: String((error as Error)?.message ?? '').slice(0, 60),
        elapsedMs: Date.now() - started,
      });
    }
  }

  // ── Durable store round-trip, exercised from inside the function ─────────
  // Transport and contract can both be healthy while the store fails, and the
  // route's catch collapses that into the same seller-facing string.
  const storeSteps: Array<Record<string, unknown>> = [];
  const probeKey = `diag-store-${Date.now()}`;
  const probeSid = 'diag-sid';
  try {
    const store = getPreviewStore();
    storeSteps.push({ step: 'select', kind: store.kind, durable: store.durable });

    const limit = await store.consume(`diag:${Date.now()}`, 5, 60_000);
    storeSteps.push({ step: 'consume', allowed: limit.allowed, remaining: limit.remaining });

    const reserved = await store.reserve(probeKey, probeSid, 'diag-result', 60_000, 30_000);
    storeSteps.push({ step: 'reserve', state: reserved.state });

    await store.complete(probeKey, 'diag-result', { outcome: 'manual_review' } as never, 60_000);
    storeSteps.push({ step: 'complete', ok: true });

    const read = await store.readResult('diag-result', probeSid);
    storeSteps.push({ step: 'readResult', status: read.status });

    const found = await store.findByKey(probeKey, probeSid);
    storeSteps.push({ step: 'findByKey', state: found.state });

    await store.cooldownMark(`diag-cooldown-${Date.now()}`, 1_000);
    storeSteps.push({ step: 'cooldownMark', ok: true });

    await store.release(probeKey);
    storeSteps.push({ step: 'release', ok: true });
  } catch (error) {
    storeSteps.push({
      step: 'FAILED',
      errorName: (error as Error)?.name ?? 'Error',
      // Store errors carry a pg error name, never a credential.
      errorHint: String((error as Error)?.message ?? '').slice(0, 160),
    });
  }

  // ── Replicate the intake's exact orchestration ───────────────────────────
  // runOnceForKey(reserve) -> evaluateUpstream -> contract -> complete.
  // Everything above passes in isolation, so the fault must be in how they are
  // composed. This reports the exception the route otherwise swallows.
  const intakeSim: Record<string, unknown> = {};
  try {
    const simKey = `diag-intake-${Date.now()}`;
    const simSid = `diag-sid-${Date.now()}`;
    let upstreamSeen: Record<string, unknown> | null = null;
    const stored = await runOnceForKey(simKey, simSid, () => `diag-res-${Date.now()}`, async () => {
      const view = await evaluateUpstream({
        address: '4100 Sandbox Clean Ln, Houston, TX 77035',
        idempotencyKey: simKey,
        sellerFacts: {},
        correlationId: 'diag-sim',
      });
      upstreamSeen = { ok: view.ok, failureCode: view.failureCode ?? null, outcome: view.outcome ?? null };
      const result = toSellerSafeResult({ ...view, supportCode: 'DIAGSIM0' });
      return { result, cacheable: !result.retryable };
    });
    intakeSim.upstream = upstreamSeen;
    intakeSim.sellerOutcome = stored.result.outcome;
    intakeSim.ok = true;
  } catch (error) {
    intakeSim.ok = false;
    intakeSim.errorName = (error as Error)?.name ?? 'Error';
    intakeSim.errorHint = String((error as Error)?.message ?? '').slice(0, 200);
  }

  return NextResponse.json({
    ok: true,
    intakeSim,
    storeSteps,
    environment: {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      // Presence booleans only — never the values.
      hasBaseUrl: Boolean(config.baseUrl),
      baseHost: config.baseUrl ? new URL(config.baseUrl).host : null,
      hasInternalSecret: Boolean(config.secret),
      hasBypassToken: Boolean(config.bypassToken),
      allowedHostPin: config.allowedHost || null,
      transportAllowed: transportAllowed(config.baseUrl, config.allowedHost),
      hasOidcToken: Boolean(oidc),
      oidcTokenLength: oidc ? oidc.length : 0,
      oidcError,
      timeoutMs: config.timeoutMs,
    },
    results,
  });
}
