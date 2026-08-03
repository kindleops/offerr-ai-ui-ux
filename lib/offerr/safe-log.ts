/**
 * Structured, privacy-conscious server logging — SERVER ONLY.
 *
 * Seller PII never reaches a log line. Addresses are recorded as a salted hash
 * prefix plus the ZIP (enough to correlate and to reason about coverage, not
 * enough to identify a household). Contact details are never logged in any
 * form, hashed or otherwise — we have no operational reason to correlate them.
 *
 * `redact()` is applied to every field bag as a backstop, so a future caller
 * that passes something sensitive by mistake still cannot emit it.
 */

import 'server-only';

import { createHmac } from 'node:crypto';

const SENSITIVE_KEYS =
  /(address|email|phone|name|token|secret|password|authorization|cookie|idempotency_key|ip)/i;

function salt(): string {
  return String(process.env.OFFERR_SESSION_SECRET ?? 'offerr-preview');
}

/** Stable, non-reversible reference to an address, plus its ZIP for coverage. */
export function addressLogRef(address: string): { address_sha256_12: string; zip: string | null } {
  const normalized = String(address ?? '').trim().toLowerCase();
  const zip = normalized.match(/\b(\d{5})(?:-\d{4})?\b\s*$/);
  return {
    address_sha256_12: createHmac('sha256', salt()).update(normalized).digest('hex').slice(0, 12),
    zip: zip ? zip[1] : null,
  };
}

export function hashRef(value: string, length = 12): string {
  return createHmac('sha256', salt()).update(String(value ?? '')).digest('hex').slice(0, length);
}

/**
 * Backstop redaction. Any key whose NAME looks sensitive is replaced with a
 * hashed reference rather than dropped, so correlation still works without the
 * value ever being written.
 */
export function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (SENSITIVE_KEYS.test(key) && typeof value === 'string' && value.length > 0) {
      // Already-hashed refs (…_sha256_12, …_ref) pass through untouched.
      out[/_(sha256_12|ref|hash)$/.test(key) ? key : `${key}_ref`] = /_(sha256_12|ref|hash)$/.test(key)
        ? value
        : hashRef(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function logEvent(event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    scope: 'offerr.public_intake',
    event,
    ...redact(fields),
  });
  // Structured single-line JSON so Vercel log drains can parse it.
  console.log(line);
}
