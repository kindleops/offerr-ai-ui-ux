# Offerr — closed-preview seller journey

The first seller-facing Offerr experience. It is a **closed preview**: reachable
only with an access token, on a non-production deployment, and it creates no
production record of any kind.

**It does not launch Offerr.** The internal evaluation engine
(`offerr_evaluation_enabled` in `rei-automation`) is unchanged and remains
`false`; the production Offerr tables remain empty; no messaging, campaign,
contract, title, LeadCommand lifecycle, Exchange listing or paid provider is
connected.

---

## 1. Architecture

```
browser
  │  POST /api/offerr/intake          ← the ONLY endpoint the browser calls
  ▼
server-side public boundary  (app/api/offerr/intake/route.ts)
  │  gate → origin/CSRF → size → session → parse → honeypot → validate
  │  → rate limit → per-property cooldown → idempotency → upstream
  ▼
lib/offerr/evaluation-client.ts      ← the ONLY module that reads the secret
  │  x-internal-api-secret (server-to-server, never in a browser)
  ▼
rei-automation  POST /api/internal/offerr/evaluations
```

The browser never sees the internal secret, never sees the internal route's URL,
and never sends a property identifier. Identity is resolved server-side from the
address by the internal spine.

### Files

| Path | Role |
|---|---|
| `app/offerr/start/page.tsx` | Gated entry. A denied visitor never receives the journey markup or its client bundle. |
| `app/api/offerr/access/route.ts` | Exchanges `?token=` for an HttpOnly cookie, then redirects (keeps the token out of the URL bar, history and `Referer`). |
| `app/api/offerr/session/route.ts` | Mints the signed session + double-submit CSRF cookies. |
| `app/api/offerr/intake/route.ts` | The public boundary. |
| `app/api/offerr/result/[resultId]/route.ts` | Session-bound result retrieval. |
| `lib/offerr/preview-config.ts` | The three gates. Server only. |
| `lib/offerr/session.ts` | Signed sessions, server-derived idempotency, opaque result ids. Server only. |
| `lib/offerr/session-constants.ts` | Cookie/header **names** only — client-safe. |
| `lib/offerr/intake-schema.ts` | Seller-safe validation + the claim overlay. |
| `lib/offerr/outcomes.ts` | The seller-safe allowlist and all outcome copy. |
| `lib/offerr/rate-limit.ts` | Preview-grade abuse controls. |
| `lib/offerr/result-store.ts` | Session-scoped results and single-flight idempotency. |
| `lib/offerr/evaluation-client.ts` | Upstream caller. Holds the secret. |
| `lib/offerr/synthetic-evaluator.ts` | **Preview-only.** Deterministic outcomes for the test matrix. |
| `lib/offerr/safe-log.ts` | Hashed, redacted structured logging. |
| `lib/offerr/analytics.ts` | Privacy-conscious funnel events. |
| `components/offerr/seller-journey/*` | The journey UI. |

---

## 2. Gates

Three independent controls. **All must pass.**

| Gate | Owner | Purpose |
|---|---|---|
| `offerr_evaluation_enabled` | `rei-automation` `system_control` | The internal engine. This app cannot read or set it. |
| `OFFERR_PUBLIC_INTAKE_ENABLED` | this app | The public surface. |
| `OFFERR_PREVIEW_ACCESS_TOKEN` | this app | Closed-preview admission. |

**The public surface does not open when the internal engine is switched on.**
They are separate controls, and a test asserts it.

**Production is hard-off.** `isProductionDeployment()` is checked first and
cannot be overridden by any request-controlled value. Even with every variable
set correctly, a production deployment refuses. An unset access token fails
**closed**, never open.

A denied visitor is never told *which* gate refused — that would let someone
probe the configuration.

### Environment

| Variable | Required | Notes |
|---|---|---|
| `OFFERR_PUBLIC_INTAKE_ENABLED` | yes | `true` to open the surface. |
| `OFFERR_PREVIEW_ACCESS_TOKEN` | yes | Admission token. Unset ⇒ closed. |
| `OFFERR_SESSION_SECRET` | yes | HMAC key. Unset ⇒ the surface throws rather than issue forgeable sessions. |
| `OFFERR_INTERNAL_API_BASE` | for real evaluation | e.g. the rei-automation preview URL. |
| `OFFERR_INTERNAL_API_SECRET` | for real evaluation | Server-only. Never sent to a browser. |
| `OFFERR_PREVIEW_SYNTHETIC_EVALUATOR` | no | Preview-only outcome simulator. Ignored in production. |

Entry URL: `/api/offerr/access?token=<token>` → redirects to `/offerr/start`.

---

## 3. Session, idempotency and result identity

- **Session** — HMAC-signed, HttpOnly, 2h TTL. Tampering or expiry ⇒ rejected.
- **CSRF** — per-session double-submit: a readable cookie that must be echoed in
  `x-offerr-csrf`. A cross-origin page can send the cookie but cannot read it.
- **Idempotency key** — derived **server-side** from
  `HMAC(session, address + seller-fact fingerprint)`. The browser never chooses
  it. Two sessions submitting identical answers get **different** keys, so one
  session can never replay or consume another's. The fingerprint is
  order-stable, so key order in the payload does not change it.
- **Result id** — opaque, and **not** an authorization token. Every read
  requires the id *and* the owning session. A cross-session read returns
  `not_found`, indistinguishable from a nonexistent id.
- **Single flight** — concurrent submissions of one key collapse onto one
  upstream call, so a double-click cannot create two snapshots.
- **Retry** reuses the same answers ⇒ the same key ⇒ a replay, not a second
  evaluation.
- **Resumable draft** — kept in `sessionStorage`, cleared on completion so a
  shared machine does not retain answers.

---

## 4. Abuse and privacy

| Control | Setting |
|---|---|
| Rate limit (session) | 5 submissions / 10 min |
| Rate limit (IP) | 15 submissions / 10 min |
| Read limit | 120 / 10 min |
| Per-property cooldown | 60 s (new evaluations only — a replay is free) |
| Body size | 16 KB, checked on both `content-length` and the actual body |
| Honeypot | Hidden, `aria-hidden`, `tabIndex=-1`. A filled trap returns a plausible retryable state rather than an obvious rejection. |
| Origin/CSRF | Enforced |

**Privacy**

- Addresses are logged as a **salted hash prefix + ZIP**, never in the clear.
- The client IP is used only as a **salted hash** for rate limiting.
- Contact details are **never forwarded** to the evaluation service — they do
  not affect the result, so sending them would be pure exposure.
- `redact()` backstops every log call: any sensitive-looking key becomes a
  hashed reference.
- **No third-party analytics is wired.** Nothing is transmitted until a sink is
  deliberately registered.
- No invasive fingerprinting.

---

## 5. Seller journey

1. **Property** — address + optional unit. Deliberately makes **no claim** that
   the property has been identified; there is no lookup while typing and no
   third-party autocomplete (which would send keystrokes to an external
   provider before consent).
2. **Property context** — type, occupancy, condition, repair level, beds/baths,
   units, recent updates, known damage. Every answer is presented to the seller
   as *their description*, and is tagged `source: seller_claim` upstream.
3. **Situation** — timeline, optional price, listed status, decision-maker
   acknowledgement (preliminary, non-legal), optional reason with an explicit
   *prefer not to say* that is never forwarded.
4. **Contact** — entirely optional, and the seller is told plainly that
   **nothing is sent**. No marketing consent is bundled here.
5. **Review and consent** — everything shown back before submission, with the
   non-binding framing *before* they ask, and a consent checkbox that is consent
   to **evaluate** and nothing else.

---

## 6. Outcome states

Every state is designed, and every one carries the non-binding disclaimer.

| State | Shows |
|---|---|
| `preliminary_range` | Range, indicative confidence, expiry, assumptions, next step |
| `conditional_range` | Range + neutral "why it is wider" (never an internal reason code) |
| `manual_review` | Received, human review, no automatic rejection, **no promised response time** |
| `confirm_property` | Could not uniquely confirm; correction/unit path. **Never shows candidate addresses.** |
| `property_not_found` | Neutral, with a correction path |
| `unsupported_property` | Neutral — a limit of the programme, not a judgement of the property |
| `insufficient_data` | Not enough recent information |
| `unavailable_retryable` | Safe retry + a support reference code |

**Never crosses the boundary:** comp selection, MAO, assignment fee, buyer
names, risk scores, suppression, acquisition execution state, internal reason
codes, candidate addresses, request ids.

**Never said:** guaranteed, approved, final offer, cash committed, contract
ready. A test asserts this across every outcome's copy.

Safety ordering: failures and identity problems are resolved **before** any
range is considered, so a partially-populated failure can never render as an
estimate. A "range eligible" outcome with no usable range degrades to manual
review rather than showing an empty band. An unrecognised internal outcome
degrades to manual review — never to a range.

---

## 7. Processing state

Stages are seller-comprehensible descriptions on a timer — deliberately **not**
a trace of internal progress, so they cannot become a side channel. They advance
and then hold; they never loop (a cycling animation reads as "stuck"). The
client holds a 45s ceiling so a dropped connection cannot trap the seller in the
animation.

---

## 8. Accessibility and performance

- Real radios in `fieldset`/`legend`; the card is the `<label>`, so arrow-key
  selection and group semantics are native.
- Focus moves to the step heading on every transition (and to the outcome
  heading on completion). The heading is `tabIndex={-1}` — programmatically
  focusable, **excluded** from the tab order (verified).
- `aria-live="polite"` for step position, processing stage and errors.
- Visible `focus-visible` rings on every control.
- `prefers-reduced-motion`: the atmosphere paints a **single static frame**
  instead of animating; the ping indicator uses `motion-reduce:animate-none`.
- The cinematic canvas is `aria-hidden`, `pointer-events-none`, and behind the
  content. **If it fails, the form is unaffected** — it is purely decorative and
  is never a data visualisation (no invented "live activity").
- Mobile input affordances: `inputMode`, `autoComplete`, `type=tel/email`.
- `robots: noindex, nofollow, nocache`.

---

## 9. Tests

`npm test` (typecheck + `node --conditions=react-server --test tests/offerr/*.test.ts`)

- `tests/offerr/seller-safety.test.ts` — 16 tests: outcome mapping, forbidden
  claims, disclaimer on every state, range sanitisation, internal-leakage,
  closed result shape, intake validation, identifier stripping, PII exclusion,
  claim tagging.
- `tests/offerr/boundary.test.ts` — 23 tests: gates, production hard-off,
  fail-closed token, secret non-exposure, session signing/expiry/tamper, CSRF,
  idempotency derivation and cross-session isolation, result-store isolation and
  expiry, single-flight, rate limits, cooldown, IP hashing.

`--conditions=react-server` makes the `server-only` marker resolve to its empty
build so these server modules run under the plain Node test runner.

---

## 10. Known limitations (must be closed before launch)

1. **Rate limiting and the result store are in-process.** Per-instance and
   non-durable on serverless. Move to a shared atomic store (Upstash Redis or
   equivalent) and pair with Vercel BotID / WAF rate rules.
2. **The synthetic evaluator must be removed** (or permanently disabled) before
   any real seller traffic. It exists so the outcome matrix could be verified
   without enabling the engine anywhere.
3. **Mobile rendering was verified structurally, not at a real 390px viewport** —
   the automation environment could not resize the viewport. Verify on a device
   or a real preview deployment before launch.
4. **Reduced motion is implemented and code-verified**, but was not exercised
   under browser emulation.
5. No durable persistence of seller submissions in this app — results live only
   for the session TTL (30 min).
6. Contact capture is inert by design; a real contact model, consent record and
   retention policy are still needed.
7. No CAPTCHA / managed bot challenge.
8. Analytics has no sink; funnel data is not yet collected anywhere.

---

## 11. Production activation prerequisites

Unchanged from the Offerr spine's own list, plus this surface:

- `offerr_evaluation_enabled` decision and canary plan (owned by `rei-automation`)
- durable rate limiting + bot management
- removal of the synthetic evaluator
- seller authentication / session model for a public surface
- approved legal disclaimers and consent records
- retention and deletion policy for seller submissions
- production observability for the public boundary
- operational support for any promised response time (none is promised today)
- LeadCommand handoff and internal review workflow
- rollback plan

**Closing this preview does not activate Offerr.**
