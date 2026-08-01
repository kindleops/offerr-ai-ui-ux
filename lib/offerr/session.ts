/**
 * Offerr preview session, idempotency and opaque result identity — SERVER ONLY.
 *
 * DESIGN RULES THIS FILE ENFORCES
 * ------------------------------
 * 1. The browser never chooses an idempotency key. It is derived server-side
 *    from (session, normalized property, seller-fact fingerprint), so a client
 *    cannot replay another session's key, and a refresh mid-flight cannot
 *    create a second snapshot for the same submission.
 * 2. A result identifier is opaque and is NOT an authorization token. Knowing a
 *    result id is never sufficient to read it — the read path also requires the
 *    signed session cookie that created it. Raw request ids are never exposed.
 * 3. The session cookie is HMAC-signed and HttpOnly, so it cannot be forged or
 *    read by page scripts.
 */

import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Names live in a client-safe module so client components can reference them
// without pulling this server-only file (and its signing secret) into a bundle.
export {
  SESSION_COOKIE,
  PREVIEW_TOKEN_COOKIE,
  CSRF_COOKIE,
  CSRF_HEADER,
} from './session-constants.ts';

/** Sessions outlive a thoughtful multi-step form but not a shared machine. */
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
/** A result stays retrievable long enough to read and revisit, then expires. */
export const RESULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

function signingKey(): string {
  const key = String(process.env.OFFERR_SESSION_SECRET ?? '').trim();
  if (!key) {
    // Fail closed and loudly. A default or empty signing key would make every
    // session forgeable, which is worse than the surface being unavailable.
    throw new Error('OFFERR_SESSION_SECRET is not configured');
  }
  return key;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hmac(payload: string): string {
  return b64url(createHmac('sha256', signingKey()).update(payload).digest());
}

export interface PreviewSession {
  /** Random, opaque session identifier. Never derived from anything seller-supplied. */
  sid: string;
  /** Issued-at, ms since epoch. */
  iat: number;
}

export function createSession(now = Date.now()): PreviewSession {
  return { sid: b64url(randomBytes(24)), iat: now };
}

/** `<sid>.<iat>.<hmac>` — compact and self-verifying. */
export function serializeSession(session: PreviewSession): string {
  const payload = `${session.sid}.${session.iat}`;
  return `${payload}.${hmac(payload)}`;
}

export function parseSession(raw: string | null | undefined, now = Date.now()): PreviewSession | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;

  const parts = value.split('.');
  if (parts.length !== 3) return null;

  const [sid, iatRaw, sig] = parts;
  const payload = `${sid}.${iatRaw}`;
  const expected = hmac(payload);

  // Compare as fixed-length buffers so a forged signature cannot be probed byte
  // by byte through response timing.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const iat = Number(iatRaw);
  if (!Number.isFinite(iat)) return null;
  if (now - iat > SESSION_TTL_MS) return null;
  if (iat > now + 60_000) return null; // clock-skew tolerant, but not a future session

  return { sid, iat };
}

/**
 * Stable fingerprint of what the seller actually submitted. Two identical
 * submissions produce the same idempotency key; changing any answer produces a
 * different one, so a corrected submission is a NEW evaluation rather than a
 * silently-replayed stale result.
 */
export function submissionFingerprint(input: {
  normalizedAddress: string;
  unit?: string | null;
  sellerFacts?: unknown;
}): string {
  const canonical = JSON.stringify({
    a: String(input.normalizedAddress ?? '').trim().toLowerCase(),
    u: String(input.unit ?? '').trim().toLowerCase(),
    f: stableStringify(input.sellerFacts ?? null),
  });
  return b64url(createHmac('sha256', signingKey()).update(canonical).digest()).slice(0, 32);
}

/**
 * Server-derived idempotency key. Bound to the session, so one session can
 * never consume or replay another session's key.
 *
 * Note this is a KEYED hash, not a plain digest: the seller's address is an
 * input, and an unkeyed digest of an address is trivially reversible by
 * dictionary attack against a known address list.
 */
export function deriveIdempotencyKey(sid: string, fingerprint: string): string {
  return `offerr_preview_${b64url(
    createHmac('sha256', signingKey()).update(`${sid}:${fingerprint}`).digest(),
  ).slice(0, 40)}`;
}

/**
 * Opaque result id. Carries no meaning and is not an authorization token — the
 * result store additionally requires the owning session id on every read.
 */
export function newResultId(): string {
  return b64url(randomBytes(18));
}

/**
 * Per-session CSRF token, double-submitted: the value is set as a readable
 * cookie AND must be echoed in a request header. A cross-origin page can cause
 * the cookie to be sent but cannot read it to set the header.
 */
export function csrfTokenFor(sid: string): string {
  return b64url(createHmac('sha256', signingKey()).update(`csrf:${sid}`).digest()).slice(0, 32);
}

export function csrfValid(sid: string, presented: string | null | undefined): boolean {
  const expected = csrfTokenFor(sid);
  const value = String(presented ?? '');
  if (value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

/** Deterministic JSON: key order must not change the fingerprint. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export const __testing = { stableStringify, b64url };
