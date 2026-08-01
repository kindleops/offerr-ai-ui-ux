/**
 * Closed-preview admission.
 *
 * Entry URL: /api/offerr/access?token=<preview token>
 *
 * Exchanges a token in the query string for an HttpOnly cookie and redirects to
 * the journey, so the token stops appearing in the address bar, in browser
 * history, and in any `Referer` header the page later emits.
 *
 * A wrong token and a disabled preview are answered identically (a 404 page),
 * so this cannot be used to discover whether the preview exists.
 */

import { NextResponse } from 'next/server';

import { SESSION_TTL_MS, PREVIEW_TOKEN_COOKIE } from '@/lib/offerr/session';
import { evaluateGates, isProductionDeployment } from '@/lib/offerr/preview-config';
import { logEvent } from '@/lib/offerr/safe-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  const gate = evaluateGates(token);
  if (!gate.ok) {
    logEvent('access.denied', { reason: gate.failure });
    // Same response for "wrong token", "gate off" and "production".
    return NextResponse.json({ ok: false, error: 'not_available' }, { status: 404 });
  }

  const response = NextResponse.redirect(new URL('/offerr/start', url.origin));
  response.cookies.set(PREVIEW_TOKEN_COOKIE, String(token), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProductionDeployment() || process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  logEvent('access.granted', {});
  return response;
}
