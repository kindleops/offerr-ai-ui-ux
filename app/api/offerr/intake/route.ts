/**
 * PUBLIC seller intake boundary.
 *
 * This is the only endpoint the browser talks to. It is deliberately NOT the
 * internal secret-protected evaluation route re-exposed — it is a separate
 * surface with its own gate, its own validation, and its own projection.
 *
 * Order of operations is load-bearing. Each check is cheap relative to the one
 * after it, and each refuses without revealing why:
 *
 *   gate -> origin/CSRF -> size -> session -> parse -> honeypot -> validate
 *        -> idempotency key -> replay lookup (read budget)
 *        -> submit rate limits -> per-property cooldown
 *        -> distributed reservation -> upstream -> seller-safe projection
 *        -> egress assertion
 *
 * The upstream call is LAST, so nothing unauthenticated, oversized, malformed
 * or rate-limited can reach the internal evaluation service.
 *
 * WHY THE REPLAY LOOKUP MOVED ABOVE THE SUBMIT COUNTERS
 * ----------------------------------------------------
 * A replay is a READ — it starts no evaluation. Charging it against the submit
 * allowance meant five refreshes of a finished result produced a 429 even
 * though nothing downstream ever ran. It is now bounded by the read rule, and
 * the submit counters are consumed only when a genuinely new evaluation is
 * about to happen.
 */

import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';

import { evaluateGates, isProductionDeployment } from '@/lib/offerr/preview-config';
import {
  CSRF_HEADER,
  PREVIEW_TOKEN_COOKIE,
  SESSION_COOKIE,
  csrfValid,
  deriveIdempotencyKey,
  newResultId,
  parseSession,
  submissionFingerprint,
} from '@/lib/offerr/session';
import {
  MAX_REQUEST_BYTES,
  composeAddress,
  intakeSubmissionSchema,
  toSellerFacts,
} from '@/lib/offerr/intake-schema';
import {
  RATE_RULES,
  checkPropertyCooldown,
  consume,
  hashedClientIp,
  markPropertyEvaluated,
} from '@/lib/offerr/rate-limit';
import { findByIdempotencyKey, runOnceForKey } from '@/lib/offerr/result-store';
import { evaluateUpstream } from '@/lib/offerr/evaluation-client';
import { failureToSellerSafe, toSellerSafeResult } from '@/lib/offerr/outcomes';
import { assertSellerSafe } from '@/lib/offerr/upstream-contract';
import { addressLogRef, hashRef, logEvent } from '@/lib/offerr/safe-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Deliberately uniform. The client learns the shape of a refusal, never the reason. */
function refuse(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function rateLimited(retryAfterSeconds: number) {
  return NextResponse.json(
    { ok: false, error: 'rate_limited', retryAfterSeconds },
    { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
  );
}

function supportCode(correlationId: string): string {
  return correlationId.slice(0, 8).toUpperCase();
}

/**
 * Final egress gate. If the object about to be serialized carries anything not
 * on the seller-safe allowlist, the response is replaced with a neutral
 * unavailability rather than shipped. Failing closed here means a leak becomes
 * an outage, which is the safe direction.
 */
function sealed(result: unknown, correlationId: string) {
  const check = assertSellerSafe(result as Record<string, unknown>);
  if (check.ok) return result;
  logEvent('intake.egress_blocked', { correlation_id: correlationId, field: check.field });
  return failureToSellerSafe('upstream_unavailable', supportCode(correlationId));
}

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  // ── Gate ────────────────────────────────────────────────────────────────
  // Production is refused here regardless of every other setting.
  const cookieStore = await cookies();
  const gate = evaluateGates(cookieStore.get(PREVIEW_TOKEN_COOKIE)?.value);
  if (!gate.ok) {
    logEvent('intake.refused', { correlation_id: correlationId, stage: 'gate', reason: gate.failure });
    return refuse(404, 'not_available');
  }

  // ── Origin / CSRF ───────────────────────────────────────────────────────
  const headerStore = await headers();
  const origin = headerStore.get('origin');
  const host = headerStore.get('host');
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!originHost || (host && originHost !== host)) {
      logEvent('intake.refused', { correlation_id: correlationId, stage: 'origin' });
      return refuse(403, 'forbidden');
    }
  }

  // ── Size ────────────────────────────────────────────────────────────────
  const declared = Number(headerStore.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    logEvent('intake.refused', { correlation_id: correlationId, stage: 'size', bytes: declared });
    return refuse(413, 'payload_too_large');
  }

  // ── Session ─────────────────────────────────────────────────────────────
  const session = parseSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    logEvent('intake.refused', { correlation_id: correlationId, stage: 'session' });
    return refuse(401, 'session_required');
  }
  if (!csrfValid(session.sid, headerStore.get(CSRF_HEADER))) {
    logEvent('intake.refused', { correlation_id: correlationId, stage: 'csrf' });
    return refuse(403, 'forbidden');
  }

  // ── Parse (bounded even if content-length lied) ─────────────────────────
  const raw = await request.text();
  if (raw.length > MAX_REQUEST_BYTES) {
    logEvent('intake.refused', { correlation_id: correlationId, stage: 'size_actual' });
    return refuse(413, 'payload_too_large');
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return refuse(400, 'invalid_request');
  }

  // ── Honeypot ────────────────────────────────────────────────────────────
  // Answer 200 with a plausible retryable state rather than an error: telling a
  // bot it was detected just teaches it what to avoid next time.
  if (typeof (body as { companyWebsite?: unknown })?.companyWebsite === 'string' &&
      (body as { companyWebsite: string }).companyWebsite.trim() !== '') {
    logEvent('intake.refused', { correlation_id: correlationId, stage: 'honeypot' });
    return NextResponse.json({
      ok: true,
      resultId: newResultId(),
      result: failureToSellerSafe('upstream_unavailable', supportCode(correlationId)),
    });
  }

  // ── Validate ────────────────────────────────────────────────────────────
  const parsed = intakeSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    // Field-level messages only; never the raw submitted values.
    const fieldErrors = parsed.error.issues.slice(0, 12).map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    logEvent('intake.invalid', { correlation_id: correlationId, issue_count: parsed.error.issues.length });
    return refuse(400, 'invalid_submission', { fieldErrors });
  }
  const submission = parsed.data;

  // ── Idempotency, derived SERVER-SIDE from session + submission ──────────
  const address = composeAddress(submission.property);
  const sellerFacts = toSellerFacts(submission);
  const fingerprint = submissionFingerprint({
    normalizedAddress: address,
    unit: submission.property.unit,
    sellerFacts,
  });
  const idempotencyKey = deriveIdempotencyKey(session.sid, fingerprint);

  try {
    // ── Replay: a read, bounded by the read rule, never charged to submits ─
    const readBudget = await consume(`read:sid:${session.sid}`, RATE_RULES.readPerSession);
    if (!readBudget.allowed) return rateLimited(readBudget.retryAfterSeconds);

    const existing = await findByIdempotencyKey(idempotencyKey, session.sid);
    if (existing) {
      logEvent('intake.replayed', {
        correlation_id: correlationId,
        idempotency_ref: hashRef(idempotencyKey),
        ...addressLogRef(address),
      });
      return NextResponse.json({
        ok: true,
        resultId: existing.resultId,
        result: sealed(existing.result, correlationId),
        replay: true,
      });
    }

    // ── Submit limits — a genuinely NEW evaluation only ────────────────────
    const ipRef = hashedClientIp(headerStore);
    const [perSession, perIp] = await Promise.all([
      consume(`submit:sid:${session.sid}`, RATE_RULES.submitPerSession),
      consume(`submit:ip:${ipRef}`, RATE_RULES.submitPerIp),
    ]);
    if (!perSession.allowed || !perIp.allowed) {
      const retryAfter = Math.max(perSession.retryAfterSeconds, perIp.retryAfterSeconds);
      logEvent('intake.rate_limited', { correlation_id: correlationId, retry_after_s: retryAfter });
      return rateLimited(retryAfter);
    }

    const cooldown = await checkPropertyCooldown(session.sid, fingerprint);
    if (!cooldown.allowed) {
      logEvent('intake.cooldown', { correlation_id: correlationId, retry_after_s: cooldown.retryAfterSeconds });
      return rateLimited(cooldown.retryAfterSeconds);
    }

    // ── Upstream + projection ─────────────────────────────────────────────
    const startedAt = Date.now();
    logEvent('intake.evaluation_started', {
      correlation_id: correlationId,
      idempotency_ref: hashRef(idempotencyKey),
      ...addressLogRef(address),
    });

    const stored = await runOnceForKey(idempotencyKey, session.sid, newResultId, async () => {
      const view = await evaluateUpstream({
        address,
        idempotencyKey,
        sellerFacts,
        correlationId,
      });

      if (view.contractField) {
        // The backend returned a privileged field. Record the KEY NAME only —
        // this is a contract regression that must be visible in logs.
        logEvent('intake.contract_violation', {
          correlation_id: correlationId,
          field: view.contractField,
        });
      }

      const result = toSellerSafeResult({ ...view, supportCode: supportCode(correlationId) });

      // A retryable outcome must stay retryable: it is neither cached under the
      // idempotency key nor allowed to start the property cooldown, so an
      // immediate retry genuinely re-evaluates.
      if (result.retryable) return { result, cacheable: false };

      await markPropertyEvaluated(session.sid, fingerprint);
      return { result, cacheable: true };
    });

    logEvent('intake.evaluation_finished', {
      correlation_id: correlationId,
      outcome: stored.result.outcome,
      duration_ms: Date.now() - startedAt,
    });

    return NextResponse.json({
      ok: true,
      resultId: stored.resultId,
      result: sealed(stored.result, correlationId),
    });
  } catch (error) {
    // Internal errors are classified, never described. No message, no stack.
    logEvent('intake.failed', {
      correlation_id: correlationId,
      error_class: (error as Error)?.name ?? 'Error',
    });
    const result = failureToSellerSafe('upstream_unavailable', supportCode(correlationId));
    return NextResponse.json({ ok: true, resultId: newResultId(), result }, { status: 200 });
  }
}

/** Anything other than POST is not part of this surface. */
export async function GET() {
  return refuse(isProductionDeployment() ? 404 : 405, 'method_not_allowed');
}
