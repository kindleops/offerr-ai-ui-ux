"use client"

/**
 * Seller journey orchestrator.
 *
 * Responsibilities kept deliberately in one place:
 *   - step state and validation gating
 *   - resumable draft (sessionStorage, cleared on completion)
 *   - single-flight submission with a hard ceiling so the seller is never
 *     trapped in the processing animation
 *   - retry that reuses the same answers, so the server-derived idempotency key
 *     is identical and no duplicate snapshot is created
 *   - funnel analytics that carry no seller data
 *
 * The browser holds NO secret, NO property identifier and NO idempotency key.
 * It sends answers; the server decides identity and idempotency.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { JourneyAtmosphere } from "./journey-atmosphere"
import { JOURNEY_STEPS, ProgressRail } from "./journey-chrome"
import { Processing } from "./processing"
import { OutcomeView } from "./outcome-view"
import { StepProperty } from "./step-property"
import { StepContext } from "./step-context"
import { StepSituation } from "./step-situation"
import { StepContact } from "./step-contact"
import { StepReview } from "./step-review"
import { track, elapsedBucket } from "@/lib/offerr/analytics"
import { failureToSellerSafe, type SellerSafeResult } from "@/lib/offerr/outcomes"
import { CSRF_HEADER } from "@/lib/offerr/session-constants"

const DRAFT_KEY = "offerr_journey_draft_v1"
/**
 * Ceiling on the processing state. The server has its own budget; this exists
 * so a dropped connection cannot leave the seller watching an animation
 * forever.
 */
const CLIENT_CEILING_MS = 45_000

export interface JourneyDraft {
  property: { address: string; unit: string }
  context: Record<string, unknown>
  situation: Record<string, unknown>
  contact: { firstName: string; email: string; phone: string }
  consent: boolean
}

const EMPTY_DRAFT: JourneyDraft = {
  property: { address: "", unit: "" },
  context: {},
  situation: {},
  contact: { firstName: "", email: "", phone: "" },
  consent: false,
}

type Phase = "form" | "processing" | "outcome"

function readCookie(name: string): string {
  if (typeof document === "undefined") return ""
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ""
}

export function SellerJourney() {
  const [stepIndex, setStepIndex] = useState(0)
  const [draft, setDraft] = useState<JourneyDraft>(EMPTY_DRAFT)
  const [phase, setPhase] = useState<Phase>("form")
  const [result, setResult] = useState<SellerSafeResult | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [hydrated, setHydrated] = useState(false)
  const [honeypot, setHoneypot] = useState("")

  const startedAtRef = useRef(Date.now())
  const submitLockRef = useRef(false)
  const csrfRef = useRef("")
  const abortRef = useRef<AbortController | null>(null)

  /* ── Session bootstrap + draft restore ─────────────────────────────────── */

  useEffect(() => {
    track("journey_viewed")

    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch("/api/offerr/session", { method: "POST" })
        const payload = await response.json().catch(() => null)
        if (!cancelled && payload?.csrfToken) csrfRef.current = payload.csrfToken
      } catch {
        // Handled at submit time as a retryable outcome.
      }
      if (!cancelled) csrfRef.current ||= readCookie("offerr_preview_csrf")
    })()

    try {
      const stored = sessionStorage.getItem(DRAFT_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as { draft: JourneyDraft; stepIndex: number }
        if (parsed?.draft) {
          setDraft({ ...EMPTY_DRAFT, ...parsed.draft })
          setStepIndex(Math.min(Math.max(0, parsed.stepIndex ?? 0), JOURNEY_STEPS.length - 1))
        }
      }
    } catch {
      // A corrupt draft must never block the journey — start clean.
    }
    setHydrated(true)

    return () => {
      cancelled = true
    }
  }, [])

  /* ── Persist the draft so a refresh does not lose typed answers ────────── */

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, stepIndex }))
    } catch {
      // Storage full or blocked: the journey still works, just not resumable.
    }
  }, [draft, stepIndex, hydrated])

  /* ── Abandonment attribution on unload ─────────────────────────────────── */

  useEffect(() => {
    const onHide = () => {
      if (phase === "outcome") return
      track("journey_abandoned", { step: JOURNEY_STEPS[stepIndex]?.key })
    }
    window.addEventListener("pagehide", onHide)
    return () => window.removeEventListener("pagehide", onHide)
  }, [phase, stepIndex])

  /* ── Browser back/forward inside the journey ───────────────────────────── */

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const target = Number((event.state as { offerrStep?: number } | null)?.offerrStep ?? 0)
      if (Number.isFinite(target)) {
        setStepIndex(Math.min(Math.max(0, target), JOURNEY_STEPS.length - 1))
        setPhase("form")
      }
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const goToStep = useCallback((next: number, push = true) => {
    setStepIndex(next)
    setFieldErrors({})
    if (push && typeof history !== "undefined") {
      history.pushState({ offerrStep: next }, "")
    }
    // Scrolling to top matters more on mobile, where the step header would
    // otherwise be off-screen after a long step.
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  const update = useCallback(<K extends keyof JourneyDraft>(key: K, value: JourneyDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }, [])

  /* ── Submission ────────────────────────────────────────────────────────── */

  const submit = useCallback(
    async (nextAttempt: number) => {
      // Single-flight. A double-click, an Enter keypress landing twice, or a
      // fast retry tap must not produce two evaluations.
      if (submitLockRef.current) return
      submitLockRef.current = true
      setSubmitting(true)
      setPhase("processing")
      startedAtRef.current = Date.now()
      setAttempt(nextAttempt)
      track("evaluation_started", { attempt: nextAttempt })

      const controller = new AbortController()
      abortRef.current = controller
      const ceiling = setTimeout(() => controller.abort(), CLIENT_CEILING_MS)

      try {
        const response = await fetch("/api/offerr/intake", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [CSRF_HEADER]: csrfRef.current || readCookie("offerr_preview_csrf"),
          },
          body: JSON.stringify({
            property: { address: draft.property.address, unit: draft.property.unit || undefined },
            context: draft.context,
            situation: draft.situation,
            contact: draft.contact,
            consent: { evaluationConsent: draft.consent },
            companyWebsite: honeypot || undefined,
          }),
          signal: controller.signal,
        })

        if (response.status === 429) {
          const payload = await response.json().catch(() => null)
          const seconds = Number(payload?.retryAfterSeconds ?? 60)
          setResult({
            ...failureToSellerSafe("upstream_unavailable", null),
            headline: "Just a moment",
            body: `You have submitted a few evaluations in a short time. Try again in about ${Math.max(
              1,
              Math.ceil(seconds / 60),
            )} minute${seconds > 90 ? "s" : ""}.`,
            nextStep: "Try again shortly.",
          })
          setPhase("outcome")
          return
        }

        if (response.status === 400) {
          // Server-side validation disagreed with the client. Send the seller
          // back to the form rather than showing an outcome they cannot act on.
          const payload = await response.json().catch(() => null)
          const errors: Record<string, string> = {}
          for (const issue of payload?.fieldErrors ?? []) {
            if (issue?.path) errors[String(issue.path)] = String(issue.message ?? "Please check this")
          }
          setFieldErrors(errors)
          setPhase("form")
          goToStep(0, false)
          return
        }

        const payload = await response.json().catch(() => null)
        if (!payload?.ok || !payload.result) {
          setResult(failureToSellerSafe("upstream_unavailable", null))
          setPhase("outcome")
          return
        }

        setResult(payload.result as SellerSafeResult)
        setPhase("outcome")
        track("evaluation_outcome", {
          outcome: (payload.result as SellerSafeResult).outcome,
          attempt: nextAttempt,
          elapsedBucket: elapsedBucket(Date.now() - startedAtRef.current),
        })

        // The journey is complete: drop the draft so a shared machine does not
        // retain the seller's answers.
        try {
          sessionStorage.removeItem(DRAFT_KEY)
        } catch {
          /* best effort */
        }
      } catch (error) {
        const aborted = (error as { name?: string })?.name === "AbortError"
        setResult(
          failureToSellerSafe(aborted ? "evaluation_timeout" : "upstream_unavailable", null),
        )
        setPhase("outcome")
      } finally {
        clearTimeout(ceiling)
        abortRef.current = null
        submitLockRef.current = false
        setSubmitting(false)
      }
    },
    [draft, honeypot, goToStep],
  )

  const retry = useCallback(() => {
    track("evaluation_retry", { attempt: attempt + 1 })
    // Same answers -> same server-derived idempotency key -> replay, not a
    // second snapshot.
    void submit(attempt + 1)
  }, [attempt, submit])

  const startOver = useCallback(() => {
    setDraft(EMPTY_DRAFT)
    setResult(null)
    setAttempt(0)
    setPhase("form")
    goToStep(0)
    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      /* best effort */
    }
  }, [goToStep])

  const editAddress = useCallback(() => {
    setResult(null)
    setPhase("form")
    goToStep(0)
  }, [goToStep])

  const stepProps = useMemo(
    () => ({ draft, update, fieldErrors, onBack: () => goToStep(Math.max(0, stepIndex - 1)) }),
    [draft, update, fieldErrors, goToStep, stepIndex],
  )

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div className="relative min-h-[100svh] w-full overflow-hidden bg-[#04070A]">
      <JourneyAtmosphere intensity={phase === "processing" ? 1.4 : 1} />

      {/* z-10 keeps the interaction surface above the atmosphere layer. */}
      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-24 pt-10 sm:px-8 sm:pt-16">
        <header className="mb-10">
          <p className="text-[11px] uppercase tracking-[0.3em] text-neon/60">Offerr</p>
          <p className="mt-1.5 text-xs text-white/35">
            Closed preview — preliminary estimates only
          </p>
        </header>

        {phase === "form" && (
          <div className="mb-10">
            <ProgressRail activeIndex={stepIndex} />
          </div>
        )}

        <main>
          {phase === "processing" && <Processing startedAt={startedAtRef.current} />}

          {phase === "outcome" && result && (
            <OutcomeView
              result={result}
              onRetry={retry}
              onEditAddress={editAddress}
              onStartOver={startOver}
            />
          )}

          {phase === "form" && (
            <>
              {stepIndex === 0 && (
                <StepProperty {...stepProps} onNext={() => goToStep(1)} />
              )}
              {stepIndex === 1 && <StepContext {...stepProps} onNext={() => goToStep(2)} />}
              {stepIndex === 2 && <StepSituation {...stepProps} onNext={() => goToStep(3)} />}
              {stepIndex === 3 && <StepContact {...stepProps} onNext={() => goToStep(4)} />}
              {stepIndex === 4 && (
                <StepReview
                  {...stepProps}
                  submitting={submitting}
                  onSubmit={() => submit(1)}
                  onEditStep={(index) => goToStep(index)}
                />
              )}
            </>
          )}
        </main>

        {/*
          Bot trap. Visually hidden, off the tab order and hidden from the
          accessibility tree, so no real seller — sighted, keyboard or screen
          reader — can ever fill it in.
        */}
        <div className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden" aria-hidden="true">
          <label htmlFor="offerr-company-website">Company website</label>
          <input
            id="offerr-company-website"
            name="companyWebsite"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
