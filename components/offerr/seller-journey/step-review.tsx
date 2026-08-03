"use client"

/**
 * Step 5 — Review and consent.
 *
 * Shows back exactly what will be submitted, so consent is informed rather than
 * nominal. The consent checkbox is consent to EVALUATE and nothing else — there
 * is no bundled marketing opt-in, because a combined checkbox makes it
 * impossible to tell what the seller actually agreed to.
 *
 * The non-binding framing appears HERE, before submission, not only on the
 * result — a seller should know the nature of what they are asking for before
 * they ask for it.
 */

import { useState } from "react"
import { GhostButton, PrimaryButton, StepShell } from "./journey-chrome"
import type { JourneyDraft } from "./journey"
import { NON_BINDING_DISCLAIMER } from "@/lib/offerr/outcomes"
import { track } from "@/lib/offerr/analytics"

const LABELS: Record<string, string> = {
  single_family: "Single family",
  condo: "Condo",
  townhouse: "Townhouse",
  multi_family_2_4: "2–4 units",
  other: "Other",
  owner_occupied: "Owner occupied",
  tenant_occupied: "Tenant occupied",
  vacant: "Vacant",
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  none: "No repairs needed",
  cosmetic: "Cosmetic only",
  moderate: "Moderate",
  major: "Major / structural",
  asap: "As soon as possible",
  "30_days": "Within 30 days",
  "60_days": "Within 60 days",
  "90_days_plus": "90 days or more",
  exploring: "Just exploring",
  yes: "Yes",
  one_of_several: "One of several decision makers",
  no: "Not on my own",
  relocation: "Relocating",
  inherited: "Inherited property",
  tired_of_managing: "Tired of managing it",
  downsizing: "Downsizing",
  financial: "Financial reasons",
  prefer_not_to_say: "Prefer not to say",
}

function label(value: unknown): string {
  const key = String(value ?? "")
  return LABELS[key] ?? key
}

function Row({ term, value }: { term: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-6 border-b border-white/[0.06] py-2.5 last:border-b-0">
      <dt className="text-sm text-white/40">{term}</dt>
      <dd className="text-right text-sm text-white/80">{value}</dd>
    </div>
  )
}

export function StepReview({
  draft,
  update,
  submitting,
  onSubmit,
  onBack,
  onEditStep,
}: {
  draft: JourneyDraft
  update: <K extends keyof JourneyDraft>(key: K, value: JourneyDraft[K]) => void
  submitting: boolean
  onSubmit: () => void
  onBack: () => void
  onEditStep: (index: number) => void
}) {
  const [touched, setTouched] = useState(false)
  const ctx = draft.context as Record<string, any>
  const s = draft.situation as Record<string, any>

  const fullAddress = [draft.property.address, draft.property.unit && `Unit ${draft.property.unit}`]
    .filter(Boolean)
    .join(", ")

  const submit = () => {
    setTouched(true)
    if (!draft.consent) return
    track("review_submitted")
    onSubmit()
  }

  return (
    <StepShell
      title="Check this over before we start"
      intro="This is exactly what we will evaluate. Nothing has been submitted yet."
      footer={
        <div className="flex flex-col gap-3 sm:flex-row">
          <PrimaryButton onClick={submit} disabled={submitting} aria-busy={submitting}>
            {submitting ? "Submitting…" : "Get my preliminary range"}
          </PrimaryButton>
          <GhostButton onClick={onBack} disabled={submitting}>
            Back
          </GhostButton>
        </div>
      }
    >
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-white/40">Property</h3>
          <button
            type="button"
            onClick={() => onEditStep(0)}
            className="text-xs text-neon/70 underline-offset-4 hover:text-neon hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/50"
          >
            Edit
          </button>
        </div>
        <dl>
          <Row term="Address" value={fullAddress} />
        </dl>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-white/40">
            What you told us about it
          </h3>
          <button
            type="button"
            onClick={() => onEditStep(1)}
            className="text-xs text-neon/70 underline-offset-4 hover:text-neon hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/50"
          >
            Edit
          </button>
        </div>
        <dl>
          <Row term="Type" value={label(ctx.propertyType)} />
          <Row term="Occupancy" value={label(ctx.occupancy)} />
          <Row term="Condition" value={label(ctx.condition)} />
          <Row term="Repairs" value={label(ctx.repairLevel)} />
          <Row term="Bedrooms" value={ctx.bedrooms != null ? String(ctx.bedrooms) : ""} />
          <Row term="Bathrooms" value={ctx.bathrooms != null ? String(ctx.bathrooms) : ""} />
          <Row term="Units" value={ctx.units != null ? String(ctx.units) : ""} />
          <Row
            term="Recent updates"
            value={(ctx.majorUpdates ?? []).map((u: string) => label(u)).join(", ")}
          />
          <Row term="Known damage" value={ctx.knownDamage ?? ""} />
        </dl>
        <p className="mt-3 text-xs text-white/30">
          We treat these as your description of the property. They have not been verified.
        </p>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-white/40">Your situation</h3>
          <button
            type="button"
            onClick={() => onEditStep(2)}
            className="text-xs text-neon/70 underline-offset-4 hover:text-neon hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/50"
          >
            Edit
          </button>
        </div>
        <dl>
          <Row term="Timeline" value={label(s.timeline)} />
          <Row
            term="Price in mind"
            value={
              s.askingPrice != null
                ? new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(Number(s.askingPrice))
                : ""
            }
          />
          <Row term="Currently listed" value={s.isListed === undefined ? "" : s.isListed ? "Yes" : "No"} />
          <Row term="Decision" value={label(s.decisionMaker)} />
          <Row term="Reason" value={s.reason ? label(s.reason) : ""} />
        </dl>
      </section>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h3 className="text-[11px] uppercase tracking-[0.18em] text-white/40">
          What you are asking for
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-white/55">{NON_BINDING_DISCLAIMER}</p>
        <p className="mt-3 text-sm leading-relaxed text-white/55">
          We use the address to look the property up in our own records and recent sales data. Your
          answers are stored with this request so we can explain how the estimate was produced.
        </p>
      </div>

      <label className="flex cursor-pointer gap-3.5 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-neon/40 hover:border-white/20">
        <input
          type="checkbox"
          checked={draft.consent}
          onChange={(e) => update("consent", e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#00E4FF]"
          aria-invalid={touched && !draft.consent ? true : undefined}
          aria-describedby={touched && !draft.consent ? "offerr-consent-error" : undefined}
        />
        <span className="text-sm text-white/70">
          Please evaluate this property and show me a preliminary range. I understand this is not an
          offer.
        </span>
      </label>
      {touched && !draft.consent && (
        <p id="offerr-consent-error" role="alert" className="text-xs text-neon-red">
          Please confirm you would like us to evaluate this property.
        </p>
      )}
    </StepShell>
  )
}
