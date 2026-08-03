"use client"

/**
 * Journey chrome — progress rail, step framing and the shared field primitives.
 *
 * Accessibility decisions worth naming:
 *   - the rail is `<ol>` with `aria-current="step"`, so a screen reader
 *     announces position without needing the visual rail at all;
 *   - the step heading is the focus target on every transition, which is what
 *     makes keyboard and screen-reader navigation coherent between steps;
 *   - option groups are real radios in a fieldset with a legend, not clickable
 *     divs, so arrow-key selection and group announcement come for free.
 */

import { useEffect, useId, useRef } from "react"
import { cn } from "@/lib/utils"

export interface StepDef {
  key: string
  label: string
  short: string
}

export const JOURNEY_STEPS: StepDef[] = [
  { key: "property", label: "Property", short: "Property" },
  { key: "context", label: "About the property", short: "Details" },
  { key: "situation", label: "Your situation", short: "Situation" },
  { key: "contact", label: "Staying in touch", short: "Contact" },
  { key: "review", label: "Review and confirm", short: "Review" },
]

export function ProgressRail({ activeIndex }: { activeIndex: number }) {
  return (
    <nav aria-label="Progress">
      <ol className="flex items-center gap-2 sm:gap-3">
        {JOURNEY_STEPS.map((step, i) => {
          const state = i < activeIndex ? "done" : i === activeIndex ? "current" : "todo"
          return (
            // min-w-0 lets the flex item shrink below its label width; without
            // it a long step label sets a floor and the rail overflows on a
            // narrow phone instead of compressing.
            <li key={step.key} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div
                  className={cn(
                    "h-1 rounded-full transition-all duration-500",
                    state === "done" && "bg-neon/70",
                    state === "current" && "bg-neon shadow-[0_0_12px_rgba(0,228,255,0.6)]",
                    state === "todo" && "bg-white/10",
                  )}
                />
                <span
                  className={cn(
                    "hidden truncate text-[10px] uppercase tracking-[0.18em] transition-colors sm:block",
                    state === "current" ? "text-neon" : "text-white/35",
                  )}
                  aria-current={state === "current" ? "step" : undefined}
                >
                  {step.short}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        Step {activeIndex + 1} of {JOURNEY_STEPS.length}: {JOURNEY_STEPS[activeIndex]?.label}
      </p>
    </nav>
  )
}

/**
 * Step shell. Moves focus to the heading whenever the step changes so keyboard
 * and screen-reader users land at the top of the new content instead of being
 * left wherever the previous "Continue" button was.
 */
export function StepShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string
  intro?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [title])

  return (
    <div className="animate-fade-in-up">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-2xl font-medium tracking-tight text-white outline-none sm:text-[28px]"
      >
        {title}
      </h2>
      {intro && <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/55">{intro}</p>}
      <div className="mt-7 space-y-6">{children}</div>
      {footer && <div className="mt-9">{footer}</div>}
    </div>
  )
}

/**
 * Ids for a field's hint and error text, derived from the control id.
 *
 * These used to come from `useId()` inside `Field` and were never exposed, so
 * nothing referenced them and callers invented ids that did not exist in the
 * DOM — a screen reader announced the label and nothing else. Deriving them
 * from the control id instead means the caller and the `Field` agree without
 * having to pass values back and forth, and the id an input points at is
 * guaranteed to be the one that renders.
 */
export function fieldIds(controlId: string) {
  return { hintId: `${controlId}-hint`, errorId: `${controlId}-error` }
}

/**
 * `aria-describedby` for a control: its error when there is one, otherwise its
 * hint. Only ever names an element that is actually rendered — pointing at a
 * missing id is worse than omitting the attribute, because assistive tech
 * reports nothing and the omission is silent.
 */
export function describedBy(controlId: string, opts: { hasHint?: boolean; hasError?: boolean }) {
  const { hintId, errorId } = fieldIds(controlId)
  if (opts.hasError) return errorId
  if (opts.hasHint) return hintId
  return undefined
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  error?: string | null
  children: React.ReactNode
  htmlFor?: string
}) {
  // A field without a control id cannot be associated with anything; fall back
  // to a generated id so the markup is still valid and unique.
  const fallback = useId()
  const controlId = htmlFor ?? fallback
  const { hintId, errorId } = fieldIds(controlId)
  return (
    <div>
      <label
        htmlFor={controlId}
        className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-white/45"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId} className="mt-2 text-xs text-white/35">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-xs text-neon-red">
          {error}
        </p>
      )}
    </div>
  )
}

export const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-[15px] text-white " +
  "placeholder:text-white/25 outline-none transition-all " +
  "focus-visible:border-neon/50 focus-visible:ring-2 focus-visible:ring-neon/30 " +
  "focus-visible:shadow-[0_0_24px_rgba(0,228,255,0.15)]"

/**
 * Radio group rendered as real inputs. The visual card is a `<label>`, so the
 * whole surface is clickable AND the control stays a native radio — arrow keys,
 * group semantics and forced-colors mode all keep working.
 */
export function OptionGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  columns = 2,
}: {
  legend: string
  name: string
  value: T | null
  options: Array<{ value: T; label: string; caption?: string }>
  onChange: (value: T) => void
  columns?: 1 | 2 | 3
}) {
  return (
    <fieldset>
      <legend className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-white/45">
        {legend}
      </legend>
      <div
        className={cn(
          "grid gap-2.5",
          columns === 1 && "grid-cols-1",
          columns === 2 && "grid-cols-1 sm:grid-cols-2",
          columns === 3 && "grid-cols-1 sm:grid-cols-3",
        )}
      >
        {options.map((option) => {
          const selected = value === option.value
          return (
            <label
              key={option.value}
              className={cn(
                "group relative cursor-pointer rounded-xl border px-4 py-3.5 transition-all",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-neon/40",
                selected
                  ? "border-neon/45 bg-neon/[0.07] shadow-[0_0_22px_rgba(0,228,255,0.13)]"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span
                className={cn(
                  "block text-sm font-medium transition-colors",
                  selected ? "text-white" : "text-white/70",
                )}
              >
                {option.label}
              </span>
              {option.caption && (
                <span className="mt-0.5 block text-xs text-white/35">{option.caption}</span>
              )}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-neon px-6 py-3.5 text-sm font-semibold",
        "text-[#04070A] transition-all hover:brightness-110",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-[#04070A]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100",
        "shadow-[0_0_28px_rgba(0,228,255,0.28)]",
        props.className,
      )}
    >
      {children}
    </button>
  )
}

export function GhostButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-3.5",
        "text-sm font-medium text-white/65 transition-all hover:border-white/25 hover:text-white",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/50",
        props.className,
      )}
    >
      {children}
    </button>
  )
}
