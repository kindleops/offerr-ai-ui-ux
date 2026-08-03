# Seller-facts translation contract

**Status:** implemented and tested (`lib/offerr/seller-facts-contract.ts`, `tests/offerr/seller-facts-contract.test.ts`)

## Why this document exists

The real-preview integration exposed a material mismatch. The OfferrAI form model
and the evaluation spine's accepted `seller_facts` are **different vocabularies**,
and nothing in this repository encoded the difference.

The spine validates `seller_facts` **fail-closed on unknown keys**. That makes the
outbound payload an exact-match contract, not a best-effort overlay:

> One unrecognised key rejects the **entire** submission — permanently.

Because the adapter originally read only `failure_code` and the route reports
validation failures in `error`, a precise `400` collapsed into a generic
"unavailable", and the seller was invited to retry a submission the backend would
reject identically every time.

## Source of truth

| | |
|---|---|
| Backend contract | `rei-automation` → `apps/api/src/lib/domain/offerr/offerr-contracts.js` |
| Local mirror | `lib/offerr/seller-facts-contract.ts` |
| Form schema (derives from the mirror) | `lib/offerr/intake-schema.ts` |
| Translation function | `toSellerFacts()` |
| Runtime gate | `app/api/offerr/intake/route.ts` → `assertSellerFactsAccepted()` |

The mirror is **not** an import — the two repositories deploy independently and
share no package. A mirror can drift, so the drift is made loud rather than
prevented: the form's enums are derived from the mirror, the outbound payload is
typed to it, and the contract tests enumerate every valid combination.

## The five accepted keys

`SELLER_FACT_KEYS = ['condition', 'occupancy', 'repairs', 'timeline', 'asking_price']`

Values are sent **raw**. The spine wraps each one in its own claim envelope
(`{ source: 'seller_claimed', verified: false, received_at }`). Wrapping them here
produced a double envelope the spine could not read. Provenance is recorded
upstream, where it is authoritative, rather than asserted by us.

## Forwarded fields

| UI field | UI type / accepted values | Backend field | Backend accepted values | Normalization | Omission |
|---|---|---|---|---|---|
| `context.condition` | enum: `excellent`, `good`, `fair`, `poor` | `condition` | identical | none — enum imported from mirror | required by form |
| `context.occupancy` | enum: `owner_occupied`, `tenant_occupied`, `vacant` | `occupancy` | same + `unknown` | none | required by form |
| `context.repairLevel` | enum: `none`, `cosmetic`, `moderate`, `major` | `repairs.level` | identical | wrapped into `repairs` object | required by form |
| `context.knownDamage` | string ≤ **400** | `repairs.notes` | ≤ **500** | trimmed; key omitted entirely when empty | omitted when blank |
| `situation.timeline` | enum: `asap`, `30_days`, `60_days`, `90_days_plus`, `exploring` | `timeline` | identical | none | required by form |
| `situation.askingPrice` | number 0 – 100,000,000 | `asking_price` | finite number ≥ 0 | key omitted when `undefined` | omitted when unanswered |

Two bounds are deliberately **stricter** on the form than upstream, so an
over-long value is a correctable form message rather than a failed evaluation:

- notes: 400 (form) vs 500 (spine)
- request body: 16 KB (form) vs 32 KB (spine)

`occupancy: unknown` is accepted upstream but **not offered** in the form. An
occupancy the seller did not state is an *omitted key*, not a claim that the
occupancy is unknown.

## Fields explicitly NOT forwarded

These are the names that produced `seller_facts_unknown_key:<key>`. Every one is
registered in `INTENTIONALLY_UNFORWARDED_UI_FIELDS`, and a test asserts the
register covers every non-contract field the form collects.

| UI field | Why it is not forwarded |
|---|---|
| `propertyType` | No spine contract. Property type is resolved from the address server-side. |
| `bedrooms` | No spine contract. Resolved from the property record, not the seller claim. |
| `bathrooms` | No spine contract. Resolved from the property record, not the seller claim. |
| `units` | No spine contract. Resolved from the property record, not the seller claim. |
| `majorUpdates` | No spine contract. Captured for the operator review summary only. |
| `reason` | No spine contract, and motivation must not influence a preliminary range. |
| `isListed` | No spine contract. An operator qualification signal, not an underwriting input. |
| `decisionMaker` | No spine contract. An operator qualification signal, not an underwriting input. |
| `firstName` / `email` / `phone` | Contact details. The evaluation does not use them; forwarding PII with no effect on the result is exposure for nothing. |
| `companyWebsite` | Honeypot. Any value discards the submission before any hop. |

**No UI field is forwarded because its name looks compatible.** `knownDamage` is
the only non-contract answer that reaches the spine, and only nested inside
`repairs.notes` — never as a top-level key.

### Dropped ≠ ignored

Unforwarded answers still shape the **idempotency fingerprint**
(`toFingerprintFacts`). If the fingerprint covered only the forwarded subset,
correcting a bedroom count would produce the same key and silently replay a stale
result instead of re-evaluating. A test asserts this directly.

## Error mapping

| Upstream | Failure code | Seller outcome | Retryable | Meaning |
|---|---|---|---|---|
| `400` | `invalid_offerr_intake` | `CONFIRM_PROPERTY` | seller-correctable | "Review the address and submit again." Not an infrastructure retry. |
| `400` | `property_not_found` | `PROPERTY_NOT_FOUND` | seller-correctable | "Check the address, or add a unit number." |
| `200` | `insufficient_data` | `INSUFFICIENT_DATA` | no | Manual review offered. |
| `409` | — | `upstream_unavailable` | **no** | Idempotency conflict. A blind retry would attempt to displace an existing snapshot. |
| `413` | — | `upstream_unavailable` | no | Payload rejected upstream. |
| `423` | `offerr_disabled` | system-unavailable | **no** | Engine flag off. Terminal by design. |
| `401` / `403` | `upstream_unavailable` | system-unavailable | no | Our misconfiguration, not the seller's; cause is not describable from outside. |
| `502` / `503` / `504` | — | system-unavailable | **yes, once** | Genuinely transient. |
| timeout / dropped connection | `evaluation_timeout` | system-unavailable | **yes, once** | Same idempotency key, so a retry cannot create a second snapshot. |
| any | `upstream_contract_violation` | system-unavailable | no | Backend leaked a privileged field. A regression, not a seller problem. |
| unrecognised | `upstream_unavailable` | system-unavailable | yes | An unknown internal code must never influence seller copy, even by branching. |

Raw backend error wording is **never** surfaced. The seller receives a vetted
outcome plus a `supportCode` (first 8 chars of the correlation ID).

## Retry policy

Only failures the backend classifies as transient are retried, and **only once**,
on the same server-derived idempotency key. `400`, `409` and `423` are terminal:
retrying cannot change the answer.

## What the tests prove

`tests/offerr/seller-facts-contract.test.ts` — 15 tests:

1. **All 960 valid UI combinations** (4 conditions × 3 occupancies × 4 repair levels × 5 timelines × notes × price) produce a payload the mirrored contract accepts.
2. No combination can emit a key outside the five-key allowlist.
3. Every previously rejected field is dropped, while the damage note still travels inside `repairs`.
4. The unforwarded-field register covers every non-contract form field.
5. Contact details never appear in the outbound payload.
6. The form offers only occupancy values the spine accepts.
7. The form rejects any enum value outside the mirror — including the old
   `within_90_days` vocabulary.
8. The form's notes bound is stricter than the spine's.
9–14. The validator reproduces the spine's error vocabulary precisely.
15. The fingerprint still covers answers the spine never receives.

## Drift procedure

If the spine changes its contract:

1. Contract tests here fail (they assert against the mirror, and the mirror is
   the thing that must be updated).
2. Update `lib/offerr/seller-facts-contract.ts` to match
   `offerr-contracts.js`.
3. The form's enums, the outbound type and the runtime gate all follow
   automatically — they derive from the mirror.

A backend enum change becomes a failing test here rather than a seller-facing
outage.
