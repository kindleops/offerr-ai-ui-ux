"use client"

/**
 * Step 3 — Selling situation.
 *
 * "Reason for selling" is optional and includes an explicit "prefer not to say"
 * that is never forwarded upstream. A seller's motivation is sensitive and is
 * not required to produce an estimate; asking for it as a required field would
 * be collecting leverage, not signal.
 *
 * The decision-maker question is deliberately a plain, preliminary
 * acknowledgement. It is not an ownership or title assertion — we are not
 * qualified to collect one at this stage and must not imply that we have.
 */

import { useState } from "react"
import { Field, GhostButton, OptionGroup, PrimaryButton, StepShell, inputClass } from "./journey-chrome"
import type { JourneyDraft } from "./journey"
import { track } from "@/lib/offerr/analytics"

export function StepSituation({
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
  const s = draft.situation as Record<string, any>
  const [touched, setTouched] = useState(false)
  const set = (key: string, value: unknown) => update("situation", { ...s, [key]: value })

  const complete = s.timeline && s.decisionMaker && typeof s.isListed === "boolean"

  const submit = () => {
    setTouched(true)
    if (!complete) return
    track("situation_step_completed")
    onNext()
  }

  return (
    <StepShell
      title="What are you hoping to do?"
      intro="This shapes what we can realistically offer to look at, and how quickly."
      footer={
        <div className="flex flex-col gap-3 sm:flex-row">
          <PrimaryButton onClick={submit}>Continue</PrimaryButton>
          <GhostButton onClick={onBack}>Back</GhostButton>
          {touched && !complete && (
            <p role="alert" className="self-center text-xs text-neon-red">
              Please answer the timeline, listing and decision questions.
            </p>
          )}
        </div>
      }
    >
      <OptionGroup
        legend="Ideal timeline"
        name="timeline"
        value={s.timeline ?? null}
        onChange={(v) => set("timeline", v)}
        options={[
          { value: "asap", label: "As soon as possible" },
          { value: "within_30_days", label: "Within 30 days" },
          { value: "within_90_days", label: "Within 90 days" },
          { value: "just_exploring", label: "Just exploring" },
        ]}
      />

      <Field
        label="Do you have a price in mind?"
        hint="Optional. If you have a number, it helps us tell you early whether we are in the same range."
        htmlFor="offerr-asking"
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35">
            $
          </span>
          <input
            id="offerr-asking"
            type="number"
            inputMode="numeric"
            min={0}
            className={`${inputClass} pl-8`}
            placeholder="250,000"
            value={s.askingPrice ?? ""}
            onChange={(e) =>
              set("askingPrice", e.target.value === "" ? undefined : Number(e.target.value))
            }
          />
        </div>
      </Field>

      <OptionGroup
        legend="Is it listed with an agent right now?"
        name="isListed"
        value={s.isListed === undefined ? null : s.isListed ? "yes" : "no"}
        onChange={(v) => set("isListed", v === "yes")}
        columns={2}
        options={[
          { value: "no", label: "No" },
          { value: "yes", label: "Yes, it is listed" },
        ]}
      />

      <OptionGroup
        legend="Are you able to make the decision to sell?"
        name="decisionMaker"
        value={s.decisionMaker ?? null}
        onChange={(v) => set("decisionMaker", v)}
        columns={3}
        options={[
          { value: "yes", label: "Yes" },
          { value: "one_of_several", label: "One of several" },
          { value: "no", label: "Not on my own" },
        ]}
      />

      <OptionGroup
        legend="Reason for selling (optional)"
        name="reason"
        value={s.reason ?? null}
        onChange={(v) => set("reason", v)}
        options={[
          { value: "relocation", label: "Relocating" },
          { value: "inherited", label: "Inherited property" },
          { value: "tired_of_managing", label: "Tired of managing it" },
          { value: "downsizing", label: "Downsizing" },
          { value: "financial", label: "Financial reasons" },
          { value: "prefer_not_to_say", label: "Prefer not to say" },
        ]}
      />
    </StepShell>
  )
}
