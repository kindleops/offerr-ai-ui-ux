"use client"

/**
 * Processing state.
 *
 * The stages are SELLER-COMPREHENSIBLE DESCRIPTIONS, not a trace. They
 * deliberately reveal nothing about comp selection, MAO, assignment fee, buyer
 * identities, risk scores, suppression or acquisition execution. They advance
 * on a timer rather than on real internal progress precisely so they cannot
 * become a side channel for internal state.
 *
 * The seller is never trapped here: the parent owns a hard ceiling and moves to
 * a retryable outcome if the request has not resolved, so an animation cannot
 * become an indefinite wait.
 */

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

const STAGES = [
  { key: "confirm", label: "Confirming the property" },
  { key: "records", label: "Reviewing available property information" },
  { key: "activity", label: "Analysing recent activity nearby" },
  { key: "eligibility", label: "Checking evaluation eligibility" },
  { key: "prepare", label: "Preparing your next step" },
] as const

export function Processing({ startedAt }: { startedAt: number }) {
  const [stage, setStage] = useState(0)
  const reducedRef = useRef(false)

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

    // Advance through the stages, then HOLD on the last one. It never loops
    // back to the start: a cycling animation reads as "stuck" and quietly
    // erodes trust while the request is still perfectly healthy.
    const timers = STAGES.map((_, i) =>
      setTimeout(() => setStage((current) => Math.max(current, i)), i * 1600),
    )
    return () => timers.forEach(clearTimeout)
  }, [startedAt])

  return (
    <div className="animate-fade-in py-4">
      <div
        className="flex items-center gap-3"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-neon" />
        </span>
        <h2 className="font-display text-xl font-medium tracking-tight text-white sm:text-2xl">
          Working on your estimate
        </h2>
      </div>

      <p className="mt-2 text-sm text-white/50">
        This usually takes a few seconds. You do not need to do anything.
      </p>

      <ol className="mt-8 space-y-3.5">
        {STAGES.map((s, i) => {
          const state = i < stage ? "done" : i === stage ? "active" : "todo"
          return (
            <li key={s.key} className="flex items-center gap-3.5">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] transition-all duration-500",
                  state === "done" && "border-neon/40 bg-neon/15 text-neon",
                  state === "active" &&
                    "border-neon bg-neon/10 text-neon shadow-[0_0_16px_rgba(0,228,255,0.45)]",
                  state === "todo" && "border-white/10 text-white/20",
                )}
                aria-hidden="true"
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span
                className={cn(
                  "text-sm transition-colors duration-500",
                  state === "done" && "text-white/45",
                  state === "active" && "text-white",
                  state === "todo" && "text-white/25",
                )}
              >
                {s.label}
              </span>
              {state === "active" && (
                <span className="ml-auto hidden text-[10px] uppercase tracking-[0.18em] text-neon/60 sm:block">
                  in progress
                </span>
              )}
            </li>
          )
        })}
      </ol>

      {/* Screen readers get the current stage only, not the whole list re-read. */}
      <p className="sr-only" aria-live="polite">
        {STAGES[stage]?.label}
      </p>
    </div>
  )
}
