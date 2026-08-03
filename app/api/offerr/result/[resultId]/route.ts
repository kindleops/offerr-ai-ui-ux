/**
 * Result retrieval.
 *
 * The result id is an opaque handle, NOT an authorization token. Reading
 * requires the id AND the signed session cookie that created it. A valid id
 * presented by a different session is answered `not_found` — identical to an id
 * that never existed — so this endpoint cannot be used to probe for the
 * existence of another seller's evaluation.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { evaluateGates } from '@/lib/offerr/preview-config';
import { PREVIEW_TOKEN_COOKIE, SESSION_COOKIE, parseSession } from '@/lib/offerr/session';
import { RATE_RULES, consume } from '@/lib/offerr/rate-limit';
import { readResult } from '@/lib/offerr/result-store';
import { hashRef, logEvent } from '@/lib/offerr/safe-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ resultId: string }> },
) {
  const cookieStore = await cookies();

  const gate = evaluateGates(cookieStore.get(PREVIEW_TOKEN_COOKIE)?.value);
  if (!gate.ok) return NextResponse.json({ ok: false, error: 'not_available' }, { status: 404 });

  const session = parseSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ ok: false, error: 'session_required' }, { status: 401 });

  const limited = await consume(`read:sid:${session.sid}`, RATE_RULES.readPerSession);
  if (!limited.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited', retryAfterSeconds: limited.retryAfterSeconds },
      { status: 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } },
    );
  }

  const { resultId } = await context.params;
  const outcome = await readResult(String(resultId ?? ''), session.sid);

  if (outcome.status === 'expired') {
    // Hashed, not truncated. A raw prefix of a live session id is credential
    // material, and `redact()` would not catch it: the key already ends in
    // `_ref`, which marks a value as ALREADY hashed and passes it through.
    logEvent('result.expired', { session_ref: hashRef(session.sid) });
    return NextResponse.json({ ok: false, error: 'expired' }, { status: 410 });
  }
  if (outcome.status === 'not_found') {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    result: outcome.result,
    expiresAt: new Date(outcome.expiresAt).toISOString(),
  });
}
