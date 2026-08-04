# OfferrAI — production canary readiness

**Merge does not equal launch.** This document describes what must be true before
a *controlled internal canary*, not before public traffic.

Each section is labelled with its real status:

- **IMPLEMENTED** — code exists on this branch and is covered by tests.
- **DESIGNED** — specified here, not yet built. Requires a follow-up branch.
- **BLOCKED** — cannot proceed without a decision or resource outside this repo.

---

## 0. Product boundary

| | |
|---|---|
| OfferrAI | Its own website, product, deployment, brand and entity. |
| Reivesti | **Unrelated.** Untouched by this work. |
| `rei-automation` | The authoritative evaluation backend, consumed over an internal HTTP boundary only. |

OfferrAI is **not** a frontend application inside `rei-automation`. It is not
moved into Reivesti or `rei-automation` by this work.

Visual identity: near-black with teal/cyan-green accents.

**Production Offerr evaluation remains disabled.** `offerr_evaluation_enabled` is
seeded `'false'` in both the spine migration and the staging bootstrap, and this
repository cannot read or set it.

---

## 1. Infrastructure ownership — **DECIDED**

OfferrAI is a standalone public website, product, repository, Vercel project and
teal/cyan-green brand. Its **backend application state deliberately lives inside
the shared rei-automation data platform.**

This is an intentional architecture decision, not a compromise: the two systems
share the property, comp, evaluation, acquisition and eventual LeadCommand
ecosystem, so a second database would duplicate exactly what must stay canonical
in one place.

| | |
|---|---|
| Supabase project | `real-estate-automation` |
| Project ref | `lcppdrmrdfblstpcbgpf` |
| Organization | REI Automation (existing) |
| Schema | `offerr_app` (private, new) |
| Migration owner | **`rei-automation`** — that repository owns the shared schema |
| Adapters and UI | `offerr-ai-ui-ux` |

**No new Supabase project or organization was created.** There is therefore **no
new fixed Supabase charge**. The only incremental cost is marginal database usage
inside the existing project: a handful of small rows per seller session, all
short-TTL and swept. PITR and backup configuration were **not** changed.

### Explicitly NOT created

no separate OfferrAI organization · no separate OfferrAI project · no duplicated
property or comp tables · no duplicated buyer or acquisition intelligence · no
independent evaluation database.

`offerr_app` is not a second acquisition database. It holds only what a public
web surface needs to be correct across serverless instances.

### Objects

`sessions` · `seller_results` · `idempotency_reservations` ·
`rate_limit_buckets` · `property_cooldowns` · `consent_records` ·
`canary_access` · `review_items`

Schema:
`rei-automation/apps/api/supabase/migrations/20260804120000_offerr_app_public_state.sql`
Verification:
`rei-automation/apps/api/scripts/offerr/offerr-app-schema-verify.sql`

### Security posture — **IMPLEMENTED, NOT YET VERIFIED AGAINST THE DATABASE**

- `offerr_app` is never added to PostgREST's exposed schema list, so it is not
  reachable over REST by anyone with any key. That beats "exposed but
  policy-restricted", where one policy mistake is a breach.
- RLS enabled on every table as an independent second layer.
- `anon` and `authenticated` revoked at schema, table and function level;
  default privileges carry the same posture to anything added later.
- `service_role` holds exactly what the adapter needs, and the credential is
  server-only.
- Raw session tokens, result handles, client IPs and full addresses are **never
  stored** — the SQL functions hash them, so the database holds no credential
  and no address.
- No foreign key from `offerr_app` reaches outside it, so the public surface has
  no path to mutate canonical acquisition tables.

### What the store supports

rate-limit counters · per-session limits · per-property cooldowns · atomic
idempotency reservations · in-flight leases · durable seller-safe results ·
expiration and cleanup · session ownership · cross-instance consistency · safe
retry · versioned consent · canary admission · operator review queue.

Every race-sensitive mutation is a single statement inside a SQL function. There
is no read-then-write in the adapter.

### What it must never store

internal acquisition payloads · raw comp rows · buyer identities · owner
enrichment · backend secrets · raw session tokens · full seller addresses in
rate-limit keys · internal property ids · underwriting output · MAO ·
assignment-fee target.

## 2. Backend authentication — **PARTIALLY IMPLEMENTED**

Current layers, in order of preference:

1. **Vercel OIDC / Trusted Sources** — *implemented in code, not yet configured on
   the backend.* `evaluation-client.ts` mints a token via `getVercelOidcToken()`
   and attaches it as `x-vercel-trusted-oidc-idp-token` whenever the runtime can
   produce one. The adapter therefore starts using Trusted Sources **the moment it
   is enabled on the backend, with no code change**.
2. **`x-internal-api-secret`** — always required by the backend. An independent
   second layer that is not removed by adopting OIDC.
3. **`x-vercel-protection-bypass`** — temporary, preview/canary only. Refused on
   production deployments (`bypassToken` returns `''` when
   `isProductionDeployment()`).

Hardening already in place:

- The bypass travels **only as a header**, never in a URL. The query-parameter
  form makes the edge reply with a redirect; combined with `redirect: 'error'`
  the fetch throws *after* the backend already processed the request — which
  produced a phantom failure where a real evaluation persisted upstream while the
  seller was told the system was unavailable.
- `redirect: 'error'` so a credential is never replayed to another host.
- Exact-host allowlisting via `OFFERR_INTERNAL_API_ALLOWED_HOST`. A changed or
  injected base URL becomes a refusal, not a credential disclosure.
- A denylist refuses loopback, link-local/metadata (`169.254.*`), `.internal` and
  Supabase hosts outright.
- Plaintext HTTP is permitted only for `localhost` and only when not deployed.

**Trusted Sources status: not yet configured.** Until it is, the bypass header
remains the preview/canary mechanism and requires a documented rotation process
(see §8).

---

## 3. Consent architecture — **DESIGNED**

Currently implemented: a single `evaluationConsent: z.literal(true)`, deliberately
not bundled with marketing consent.

Required before canary — separate, independently recorded, **none preselected**:

| Consent | Required? | Bundled? |
|---|---|---|
| Consent to evaluate this property | required | — |
| Acknowledgement that information is preliminary | required | may be combined with the above as an acknowledgement, not a permission |
| Acknowledgement that a displayed range is non-binding and **is not an offer** | required | — |
| Privacy-policy acceptance | required where applicable | — |
| Marketing consent | optional | **never** bundled with evaluation consent |
| SMS consent | optional | **never** bundled |
| Email consent | optional | **never** bundled |

Versioned consent metadata to record for later audit: document/version ID ·
timestamp · session · consent types · copy version.

> This branch may draft and integrate the UI boundaries. It does **not** claim
> legal approval. Copy must be reviewed by counsel before any canary that shows
> it to a person outside the team.

**No outbound communication is activated by this work.** No SMS, email, campaign
or messaging path is enabled.

---

## 4. Internal review boundary — **DESIGNED**

The handoff after a seller evaluation, with LeadCommand automation **off**.

Explicitly forbidden during canary: automatic message · automatic campaign ·
automatic contract · title order · Exchange publication · autonomous offer ·
LeadCommand lifecycle creation.

An authorized operator should see:

opaque OfferrAI evaluation reference · seller-safe property summary ·
seller-submitted facts · outcome category · preliminary range where applicable ·
correlation ID · submission time · review status · **explicit operator action
required**.

Raw comp rows and internal underwriting data are **not** exposed unless the
existing authorized backend review tooling already permits it.

If this requires backend work it belongs in a **separate coordinated PR** in
`rei-automation`, not here.

---

## 5. Observability — **PARTIALLY IMPLEMENTED**

Implemented events (`lib/offerr/safe-log.ts` → structured single-line JSON):

`intake.invalid` · `intake.replayed` · `intake.rate_limited` · `intake.cooldown` ·
`intake.evaluation_started` · `intake.contract_violation` ·
`intake.outbound_contract_drift` *(new)* · `intake.egress_blocked`

`safe-log.ts` is the **only** module permitted to reach stdout; `no-console` is a
lint **error** everywhere else in `lib/offerr` and `app/api`, so redaction cannot
be bypassed.

Still to add: backend stage timings · retry counts · latency p50/p95 ·
availability · abandonment by step · funnel events.

### Never sent to analytics

full address · contact details · seller facts · preliminary range · internal
reason codes · raw backend payloads · internal request/evaluation IDs.

Addresses appear in logs only via `addressLogRef()`; the client IP is hashed,
never stored raw (both covered by existing tests).

### Required alerts — **DESIGNED**

elevated unavailable rate · backend 401/403 · backend 423 during an authorized
canary · contract-validation failures · result-store failures · idempotency
conflicts · evaluation latency breach · unexpected side-effect detection.

---

## 6. Abuse controls — **IMPLEMENTED**

| Control | Value |
|---|---|
| Submits per session | 5 per 10 min |
| Submits per IP | 15 per 10 min |
| Reads per session | 120 per 10 min |
| Access attempts per IP | 10 per 10 min (guards token guessing) |
| Per-property cooldown | 60 s |
| Store unavailable | **denied** (`retryAfter` 30 s) |

Also implemented: honeypot (`companyWebsite`) · CSRF cookie + header · signed,
expiring sessions · result handles scoped to the minting session · cross-session
denial · address bounds (240 chars) · body-size limit (16 KB) · hashed client IP.

Constant-time comparison is used for the preview token so a `===` cannot leak its
prefix length through timing.

---

## 7. Feature gates and kill switches — **IMPLEMENTED + TESTED**

Four **independent** controls, all fail-closed, all defaulting off in production:

| Control | Owner | Purpose |
|---|---|---|
| `isProductionDeployment()` | this app, **not overridable** | Production refuses first, before any other value is consulted. |
| `OFFERR_PUBLIC_INTAKE_ENABLED` | this app | Public intake availability. |
| `OFFERR_PREVIEW_ACCESS_TOKEN` | this app | Canary admission. Unset ⇒ **denied**, never "no token required". |
| `offerr_evaluation_enabled` | `rei-automation` `system_control` | Backend evaluation availability. Surfaces as `423`. |

The public surface cannot become reachable merely because the internal engine is
switched on — they are separate controls with separate owners.

A denied visitor is never told **which** gate refused, so the configuration cannot
be probed.

### The four independent server-side gates — **IMPLEMENTED**

| Variable | Controls | Default |
|---|---|---|
| `OFFERR_PUBLIC_INTAKE_ENABLED` | public intake availability | false |
| `OFFERR_BACKEND_EVALUATION_ENABLED` | backend evaluation availability | false |
| `OFFERR_CANARY_ACCESS_ENABLED` | canary admission | false |
| `OFFERR_REVIEW_HANDOFF_ENABLED` | operational review handoff | false |

`gateMatrix()` resolves all four server-side and returns all-false on a
production deployment regardless of configuration.

`tests/offerr/gates.test.ts` (8 tests) proves the property that actually matters
— **orthogonality**, not switchability:

- turning any ONE gate on opens no other (full 4×4 matrix);
- the backend/engine gate does not expose public intake;
- public intake does not bypass canary access;
- review handoff stays closed even with every other gate open;
- production forces all four false whatever is configured;
- only the literal `"true"` opens a gate — `TRUE`, `1`, `yes`, `on`, `trueish`
  and empty all read as closed, so a half-deployed value fails closed;
- no gate is a `NEXT_PUBLIC_` variable. A client-readable flag is a display
  hint, not a control: the browser can lie about it.

Verified absent from the built client bundle.

---

## 8. Secret rotation — **DESIGNED**

Rotation process required before canary for: `OFFERR_INTERNAL_API_SECRET` ·
`OFFERR_INTERNAL_BYPASS_TOKEN` · `OFFERR_PREVIEW_ACCESS_TOKEN` ·
`OFFERR_SESSION_SECRET` · `OFFERR_PREVIEW_STATE_DATABASE_URL`.

Rotating the session secret invalidates live sessions — acceptable during a
canary, and it must be stated in the runbook rather than discovered.

---

## 9. Canary plan — **DESIGNED, NOT ACTIVATED**

The first canary must be restricted to **internal authorized users, named test
accounts, or explicitly allowlisted sessions**. Anonymous public traffic is not
accepted.

To be fixed before activation: maximum daily submissions · maximum per-user
submissions · markets allowed · supported asset types · operating hours ·
operator on-call owner · review SLA · data-retention window · evidence to
collect.

### Automatic rollback triggers

any wrong-property resolution · any private-data leak · any duplicate snapshot ·
any unexpected message or campaign · any binding/guaranteed language · any
contract/title/Exchange side effect · elevated unavailable rate · failed result
recovery · cross-session result access · latency beyond the approved threshold.

Rollback is: set `OFFERR_PUBLIC_INTAKE_ENABLED=false` (immediate, fails closed),
and independently unset `OFFERR_PREVIEW_ACCESS_TOKEN` to deny all admission.

---

## 10. Security review — findings on this branch

| Finding | Status |
|---|---|
| `next.config.mjs` had `ignoreBuildErrors: true` — the production build never typechecked | **fixed** on this branch |
| No lint gate at all (`next lint` removed in Next 16, no ESLint config) — `pnpm lint` exited without inspecting a file | **fixed**; two custom rules now block server-only imports and private `process.env` reads in client modules |
| Turbopack was inferring the **home directory** as workspace root via a stray lockfile | **fixed** via `turbopack.root` |
| Outbound `seller_facts` had no contract check — a drift reached the seller as a retryable dead end | **fixed**; typed + runtime-gated + 960-combination test |
| Client bundle scanned for `OFFERR_INTERNAL_API_SECRET`, `OFFERR_PREVIEW_ACCESS_TOKEN`, `OFFERR_INTERNAL_BYPASS_TOKEN`, `OFFERR_PREVIEW_STATE_DATABASE_URL`, `OFFERR_SESSION_SECRET`, `x-internal-api-secret`, `x-vercel-protection-bypass`, `postgres://` | **0 occurrences** in `.next/static` |
| Supabase preview branch on the **production** project, live and billing for ~19h | **deleted** |
| Response egress: allowlist projection + fail-closed denylist scan at any depth | already implemented, tested |

### Security headers — **IMPLEMENTED, NOT YET VERIFIED ON A DEPLOYMENT**

Applied to `/(.*)` in `vercel.json`: `Content-Security-Policy`,
`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
`Permissions-Policy`, `Strict-Transport-Security` (2y, preload),
`Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
`X-DNS-Prefetch-Control`.

CSP is strict everywhere it can be: `default-src 'self'`, `connect-src 'self'`,
`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`,
`form-action 'self'`.

> **`script-src` and `style-src` still carry `'unsafe-inline'.`** Next injects
> inline bootstrap scripts, and removing it requires nonce-based CSP through the
> proxy layer. That change cannot be made safely without testing on a real
> deployment — shipping it blind would white-screen the app. **Headers have NOT
> been verified against a deployment**; that is required before canary, and
> nonce-based hardening is the follow-up.

Still outstanding: dependency vulnerability scan; RSC payload review.

---

## 11. Remaining launch prerequisites

**Blocking a canary:**

1. Decide and provision OfferrAI-owned durable state (§1). Record the cost.
2. Configure Vercel Trusted Sources on the backend, or accept the bypass header
   with a documented rotation process (§2, §8).
3. Build the consent UI and versioned consent metadata (§3).
4. Build the internal review record/adapter (§4) — likely a coordinated
   `rei-automation` PR.
5. Define canary limits and the on-call owner (§9).
6. Legal review of all seller-facing copy (§3).

**Blocking public launch, beyond the above:**

7. Move the Vercel project to a standalone OfferrAI scope (§1).
8. Complete observability, dashboards and alerts (§5).
9. Re-run the full real public matrix against the final durable store and the
   final adapter (see `docs/offerr/verification-status.md`).
10. CSP, security headers and a dependency vulnerability scan (§10).

---

## 12. Standing constraints

- OfferrAI remains **standalone**. Reivesti is unrelated and was untouched.
- **Production Offerr evaluation remains disabled.**
- **Merge does not equal launch.**
- No SMS, email, contract, title, SignPro, LeadCommand lifecycle or marketplace
  publication is enabled by this work.
