"use client"

/**
 * Seller-facing outcome states.
 *
 * Every field rendered here comes from the seller-safe projection built by
 * `lib/offerr/outcomes.ts`. This component performs NO mapping and invents NO
 * copy for a state it does not recognise — an unknown outcome renders the
 * generic retryable card rather than guessing, so a new internal state can
 * never accidentally be presented as an estimate.
 *
 * The non-binding disclaimer is rendered for EVERY outcome, not just ranges.
 */

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { GhostButton, PrimaryButton } from "./journey-chrome"
import { RANGE_OUTCOMES, SELLER_OUTCOMES, type SellerSafeResult } from "@/lib/offerr/outcomes"

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatExpiry(iso: string | null) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(date)
}

const ACCENT: Record<string, string> = {
  [SELLER_OUTCOMES.PRELIMINARY_RANGE]: "text-neon",
  [SELLER_OUTCOMES.CONDITIONAL_RANGE]: "text-neon",
  [SELLER_OUTCOMES.MANUAL_REVIEW]: "text-neon-green",
  [SELLER_OUTCOMES.CONFIRM_PROPERTY]: "text-white",
  [SELLER_OUTCOMES.PROPERTY_NOT_FOUND]: "text-white",
  [SELLER_OUTCOMES.UNSUPPORTED_PROPERTY]: "text-white",
  [SELLER_OUTCOMES.INSUFFICIENT_DATA]: "text-white",
  [SELLER_OUTCOMES.UNAVAILABLE_RETRYABLE]: "text-white",
}

export function OutcomeView({
  result,
  onRetry,
  onEditAddress,
  onStartOver,
}: {
  result: SellerSafeResult
  onRetry: () => void
  onEditAddress: () => void
  onStartOver: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  // The outcome is the most important thing on the page; move focus to it so a
  // screen-reader user is not left at the bottom of the review step.
  useEffect(() => {
    headingRef.current?.focus()
  }, [result.outcome])

  const showsRange = RANGE_OUTCOMES.includes(result.outcome) && result.range !== null
  const expiry = formatExpiry(result.expiresAt)
  const identityIssue =
    result.outcome === SELLER_OUTCOMES.CONFIRM_PROPERTY ||
    result.outcome === SELLER_OUTCOMES.PROPERTY_NOT_FOUND

  return (
    <div className="animate-fade-in-up" role="region" aria-labelledby="offerr-outcome-heading">
      <h2
        id="offerr-outcome-heading"
        ref={headingRef}
        tabIndex={-1}
        className={cn(
          "font-display text-2xl font-medium tracking-tight outline-none sm:text-[30px]",
          ACCENT[result.outcome] ?? "text-white",
        )}
      >
        {result.headline}
      </h2>

      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/65">{result.body}</p>

      {showsRange && result.range && (
        <div className="mt-8 rounded-2xl border border-neon/20 bg-neon/[0.04] p-6 shadow-[0_0_40px_rgba(0,228,255,0.10)] sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.2em] text-neon/70">
            Preliminary range — not an offer
          </p>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-3xl font-medium tracking-tight text-white sm:text-[42px]">
              {formatUsd(result.range.low)}
            </span>
            <span className="text-xl text-white/30">—</span>
            <span className="font-display text-3xl font-medium tracking-tight text-white sm:text-[42px]">
              {formatUsd(result.range.high)}
            </span>
          </div>

          {result.confidence && (
            <p className="mt-3 text-sm text-white/50">
              {result.confidence === "indicative"
                ? "This is an indicative range based on the information available."
                : "This range is wider than usual because some details still need confirming."}
            </p>
          )}

          {expiry && (
            <p className="mt-4 text-xs text-white/40">
              Based on data as of today. We would revisit it after {expiry}.
            </p>
          )}
        </div>
      )}

      {result.detail && (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-sm text-white/60">{result.detail}</p>
        </div>
      )}

      {result.assumptions.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-white/40">
            What this assumes
          </h3>
          <ul className="mt-2.5 space-y-1.5">
            {result.assumptions.map((assumption) => (
              <li key={assumption} className="flex gap-2.5 text-sm text-white/55">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-neon/50" aria-hidden="true" />
                {assumption}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="text-[11px] uppercase tracking-[0.18em] text-white/40">What happens next</h3>
        <p className="mt-2 text-sm text-white/65">{result.nextStep}</p>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {result.retryable && !identityIssue && (
          <PrimaryButton onClick={onRetry}>Try again</PrimaryButton>
        )}
        {identityIssue && <PrimaryButton onClick={onEditAddress}>Check the address</PrimaryButton>}
        <GhostButton onClick={onStartOver}>Start a new property</GhostButton>
      </div>

      {/*
        Rendered for every outcome, including failures — a seller who saw a
        number on a previous screen must not be able to reach a state where the
        non-binding framing has quietly disappeared.
      */}
      <p className="mt-8 border-t border-white/[0.06] pt-5 text-xs leading-relaxed text-white/35">
        {result.disclaimer}
      </p>

      {result.supportCode && (
        <p className="mt-3 text-xs text-white/25">
          Reference code <span className="font-mono text-white/40">{result.supportCode}</span> — quote
          this if you contact us about this estimate.
        </p>
      )}
    </div>
  )
}
