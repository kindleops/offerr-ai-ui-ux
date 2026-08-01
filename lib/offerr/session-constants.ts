/**
 * Cookie and header NAMES shared between the server session module and client
 * components.
 *
 * This file exists because `lib/offerr/session.ts` is marked `server-only` — it
 * reads the signing secret — so a client component importing it would fail the
 * build. Names are not secrets; the values behind them never appear here.
 */

export const SESSION_COOKIE = 'offerr_preview_session';
export const PREVIEW_TOKEN_COOKIE = 'offerr_preview_access';
export const CSRF_COOKIE = 'offerr_preview_csrf';
export const CSRF_HEADER = 'x-offerr-csrf';
