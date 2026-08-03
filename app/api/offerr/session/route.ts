/**
 * Session bootstrap.
 *
 * Mints the signed, HttpOnly session cookie and the double-submit CSRF cookie.
 * A Server Component cannot set cookies during render, so the journey calls
 * this once before it can submit anything.
 *
 * The CSRF cookie is intentionally readable by scripts (it must be echoed in a
 * header); the SESSION cookie is not. A cross-origin page can cause the session
 * cookie to be sent but cannot read the CSRF value to construct the header.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { evaluateGates, isProductionDeployment } from '@/lib/offerr/preview-config';
import {
  CSRF_COOKIE,
  PREVIEW_TOKEN_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  csrfTokenFor,
  parseSession,
  serializeSession,
} from '@/lib/offerr/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const cookieStore = await cookies();

  const gate = evaluateGates(cookieStore.get(PREVIEW_TOKEN_COOKIE)?.value);
  if (!gate.ok) return NextResponse.json({ ok: false, error: 'not_available' }, { status: 404 });

  // Reuse a live session so a refresh does not orphan in-flight results.
  const existing = parseSession(cookieStore.get(SESSION_COOKIE)?.value);
  const session = existing ?? createSession();
  const csrf = csrfTokenFor(session.sid);

  const response = NextResponse.json({ ok: true, csrfToken: csrf });
  const secure = !isProductionDeployment() ? process.env.NODE_ENV === 'production' : true;
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);

  if (!existing) {
    response.cookies.set(SESSION_COOKIE, serializeSession(session), {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge,
    });
  }

  response.cookies.set(CSRF_COOKIE, csrf, {
    // Readable by design — this is the double-submit half.
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge,
  });

  return response;
}
