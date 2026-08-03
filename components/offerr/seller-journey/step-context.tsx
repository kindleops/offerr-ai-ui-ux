"use client"

/**
 * Step 2 — Property context.
 *
 * Collects only facts that materially change an evaluation. Every answer is an
 * UNVERIFIED CLAIM and is labelled as such to the seller, because the overlay
 * downstream treats it that way: a claim can reduce confidence in a range, it
 * can never improve one.
 */

import { useState } from "react"
import { Field, GhostButton, OptionGroup, PrimaryButton, StepShell, inputClass, describedBy } from "./journey-chrome"
import type { JourneyDraft } from "./journey"
import { track } from "@/lib/offerr/analytics"

const UPDATES = [
  { value: "roof", label: "Roof" },
  { value: "hvac", label: "HVAC" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bath", label: "Bathrooms" },
  { value: "windows", label: "Windows" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
] as const

export function StepContext({
  draft,
  update,
  onNext,
  onBack,
}: {
  draft: JourneyDraft
  update: <K extends keyof JourneyDraft>(key: K, value: JourneyDraft[K]) => void
  onNext: () => void
  onBack: () => void
}) {
  const ctx = draft.context as Record<string, any>
  const [touched, setTouched] = useState(false)

  const set = (key: string, value: unknown) => update("context", { ...ctx, [key]: value })

  const isMulti = ctx.propertyType === "multi_family_2_4"
  const complete = ctx.propertyType && ctx.occupancy && ctx.condition && ctx.repairLevel

  const toggleUpdate = (value: string) => {
    const current: string[] = Array.isArray(ctx.majorUpdates) ? ctx.majorUpdates : []
    set(
      "majorUpdates",
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    )
  }

  const submit = () => {
    setTouched(true)
    if (!complete) return
    track("context_step_completed")
    onNext()
  }

  return (
    <StepShell
      title="Tell us about the property"
      intro="These are your descriptions, not something we have verified. They help us judge how confident an estimate can be."
      footer={
        <div className="flex flex-col gap-3 sm:flex-row">
          <PrimaryButton onClick={submit} disabled={touched && !complete}>
            Continue
          </PrimaryButton>
          <GhostButton onClick={onBack}>Back</GhostButton>
          {touched && !complete && (
            <p role="alert" className="self-center text-xs text-neon-red">
              Please answer the four questions above.
            </p>
          )}
        </div>
      }
    >
      <OptionGroup
        legend="Property type"
        name="propertyType"
        value={ctx.propertyType ?? null}
        onChange={(v) => set("propertyType", v)}
        options={[
          { value: "single_family", label: "Single family" },
          { value: "condo", label: "Condo" },
          { value: "townhouse", label: "Townhouse" },
          { value: "multi_family_2_4", label: "2–4 units" },
          { value: "other", label: "Something else" },
        ]}
      />

      <OptionGroup
        legend="Who is living there?"
        name="occupancy"
        value={ctx.occupancy ?? null}
        onChange={(v) => set("occupancy", v)}
        columns={3}
        options={[
          { value: "owner_occupied", label: "I live there" },
          { value: "tenant_occupied", label: "A tenant" },
          { value: "vacant", label: "It is empty" },
        ]}
      />

      <OptionGroup
        legend="Overall condition"
        name="condition"
        value={ctx.condition ?? null}
        onChange={(v) => set("condition", v)}
        options={[
          { value: "excellent", label: "Excellent", caption: "Move-in ready" },
          { value: "good", label: "Good", caption: "Minor wear" },
          { value: "fair", label: "Fair", caption: "Dated but sound" },
          { value: "poor", label: "Poor", caption: "Needs real work" },
        ]}
      />

      <OptionGroup
        legend="Repairs needed"
        name="repairLevel"
        value={ctx.repairLevel ?? null}
        onChange={(v) => set("repairLevel", v)}
        options={[
          { value: "none", label: "None" },
          { value: "cosmetic", label: "Cosmetic only" },
          { value: "moderate", label: "Moderate" },
          { value: "major", label: "Major / structural" },
        ]}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Bedrooms" htmlFor="offerr-beds">
          <input
            id="offerr-beds"
            type="number"
            inputMode="numeric"
            min={0}
            max={20}
            className={inputClass}
            value={ctx.bedrooms ?? ""}
            onChange={(e) => set("bedrooms", e.target.value === "" ? undefined : Number(e.target.value))}
          />
        </Field>
        <Field label="Bathrooms" htmlFor="offerr-baths">
          <input
            id="offerr-baths"
            type="number"
            inputMode="decimal"
            step="0.5"
            min={0}
            max={20}
            className={inputClass}
            value={ctx.bathrooms ?? ""}
            onChange={(e) => set("bathrooms", e.target.value === "" ? undefined : Number(e.target.value))}
          />
        </Field>
        {isMulti && (
          <Field label="Units" htmlFor="offerr-units">
            <input
              id="offerr-units"
              type="number"
              inputMode="numeric"
              min={1}
              max={4}
              className={inputClass}
              value={ctx.units ?? ""}
              onChange={(e) => set("units", e.target.value === "" ? undefined : Number(e.target.value))}
            />
          </Field>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-white/45">
          Anything updated in the last 10 years?
        </legend>
        <div className="flex flex-wrap gap-2">
          {UPDATES.map((item) => {
            const selected = (ctx.majorUpdates ?? []).includes(item.value)
            return (
              <label
                key={item.value}
                className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-neon/40 ${
                  selected
                    ? "border-neon/45 bg-neon/10 text-white"
                    : "border-white/10 bg-white/[0.02] text-white/55 hover:border-white/25"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selected}
                  onChange={() => toggleUpdate(item.value)}
                />
                {item.label}
              </label>
            )
          })}
        </div>
      </fieldset>

      <Field
        label="Any known damage or issues?"
        hint="Optional. A short description is enough."
        htmlFor="offerr-damage"
      >
        <textarea
          id="offerr-damage"
          aria-describedby={describedBy("offerr-damage", { hasHint: true })}
          rows={3}
          maxLength={400}
          className={`${inputClass} resize-none`}
          placeholder="Foundation crack in the garage, roof leak over the kitchen…"
          value={ctx.knownDamage ?? ""}
          onChange={(e) => set("knownDamage", e.target.value)}
        />
      </Field>
    </StepShell>
  )
}
