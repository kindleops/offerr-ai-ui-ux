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
 *        -> rate limit -> per-property cooldown -> idempotency -> upstream
 *        -> seller-safe projection
 *
 * The upstream call is LAST, so nothing unauthenticated, oversized, malformed
 * or rate-limited can reach the internal evaluation service.
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
import { findByIdempotencyKey, putResult, runOnceForKey } from '@/lib/offerr/result-store';
import { evaluateUpstream } from '@/lib/offerr/evaluation-client';
import { failureToSellerSafe, toSellerSafeResult } from '@/lib/offerr/outcomes';
import { addressLogRef, hashRef, logEvent } from '@/lib/offerr/safe-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Deliberately uniform. The client learns the shape of a refusal, never the reason. */
function refuse(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function supportCode(correlationId: string): string {
  return correlationId.slice(0, 8).toUpperCase();
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

  // ── Rate limits ─────────────────────────────────────────────────────────
  const ipRef = hashedClientIp(headerStore);
  const perSession = consume(`submit:sid:${session.sid}`, RATE_RULES.submitPerSession);
  const perIp = consume(`submit:ip:${ipRef}`, RATE_RULES.submitPerIp);
  if (!perSession.allowed || !perIp.allowed) {
    const retryAfter = Math.max(perSession.retryAfterSeconds, perIp.retryAfterSeconds);
    logEvent('intake.rate_limited', { correlation_id: correlationId, retry_after_s: retryAfter });
    return NextResponse.json(
      { ok: false, error: 'rate_limited', retryAfterSeconds: retryAfter },
      { status: 429, headers: { 'retry-after': String(retryAfter) } },
    );
  }

  // ── Idempotency, derived SERVER-SIDE from session + submission ──────────
  const address = composeAddress(submission.property);
  const fingerprint = submissionFingerprint({
    normalizedAddress: address,
    unit: submission.property.unit,
    sellerFacts: toSellerFacts(submission),
  });
  const idempotencyKey = deriveIdempotencyKey(session.sid, fingerprint);

  const existing = findByIdempotencyKey(idempotencyKey, session.sid);
  if (existing) {
    logEvent('intake.replayed', {
      correlation_id: correlationId,
      idempotency_ref: hashRef(idempotencyKey),
      ...addressLogRef(address),
    });
    return NextResponse.json({ ok: true, resultId: existing.resultId, result: existing.result, replay: true });
  }

  // Cooldown applies only to a genuinely NEW evaluation — a replay above is
  // free, so a refresh is never punished.
  const cooldown = checkPropertyCooldown(session.sid, fingerprint);
  if (!cooldown.allowed) {
    logEvent('intake.cooldown', { correlation_id: correlationId, retry_after_s: cooldown.retryAfterSeconds });
    return NextResponse.json(
      { ok: false, error: 'rate_limited', retryAfterSeconds: cooldown.retryAfterSeconds },
      { status: 429, headers: { 'retry-after': String(cooldown.retryAfterSeconds) } },
    );
  }

  // ── Upstream + projection ───────────────────────────────────────────────
  const startedAt = Date.now();
  logEvent('intake.evaluation_started', {
    correlation_id: correlationId,
    idempotency_ref: hashRef(idempotencyKey),
    ...addressLogRef(address),
  });

  try {
    const stored = await runOnceForKey(idempotencyKey, async () => {
      const view = await evaluateUpstream({
        address,
        idempotencyKey,
        sellerFacts: toSellerFacts(submission),
        correlationId,
      });
      const result = toSellerSafeResult({ ...view, supportCode: supportCode(correlationId) });
      markPropertyEvaluated(session.sid, fingerprint);
      return putResult({ resultId: newResultId(), sid: session.sid, idempotencyKey, result });
    });

    logEvent('intake.evaluation_finished', {
      correlation_id: correlationId,
      outcome: stored.result.outcome,
      duration_ms: Date.now() - startedAt,
    });

    return NextResponse.json({ ok: true, resultId: stored.resultId, result: stored.result });
  } catch (error) {
    // Internal errors are classified, never described. No message, no stack.
    logEvent('intake.failed', {
      correlation_id: correlationId,
      duration_ms: Date.now() - startedAt,
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
