"use client"

/**
 * Step 4 — Staying in touch.
 *
 * CLOSED-PREVIEW CONTACT MODEL
 * ----------------------------
 * Every field here is OPTIONAL, and the seller is told plainly that nothing is
 * sent. That is not a placeholder — it is the honest description of the system:
 * messaging, campaigns and lifecycle creation are all disconnected in this
 * preview, so collecting a phone number as a required field would be gathering
 * data we cannot act on and have no consented purpose for.
 *
 * Contact details are also NOT forwarded to the evaluation service (see
 * `toSellerFacts`) — they do not affect the result, so sending them would be
 * pure exposure.
 *
 * Marketing consent is deliberately ABSENT. Consent to be evaluated is
 * collected on the review step; bundling a marketing opt-in with it would make
 * both meaningless.
 */

import { Field, GhostButton, PrimaryButton, StepShell, inputClass } from "./journey-chrome"
import type { JourneyDraft } from "./journey"
import { track } from "@/lib/offerr/analytics"

export function StepContact({
  draft,
  update,
  fieldErrors,
  onNext,
  onBack,
}: {
  draft: JourneyDraft
  update: <K extends keyof JourneyDraft>(key: K, value: JourneyDraft[K]) => void
  fieldErrors: Record<string, string>
  onNext: () => void
  onBack: () => void
}) {
  const contact = draft.contact

  const submit = () => {
    track("contact_step_completed")
    onNext()
  }

  return (
    <StepShell
      title="How should we reach you?"
      intro="All optional. In this preview nothing is sent — no texts, no emails, no calls. Your result appears on the next screen either way."
      footer={
        <div className="flex flex-col gap-3 sm:flex-row">
          <PrimaryButton onClick={submit}>Continue</PrimaryButton>
          <GhostButton onClick={onBack}>Back</GhostButton>
        </div>
      }
    >
      <div className="rounded-xl border border-neon/15 bg-neon/[0.03] p-4">
        <p className="text-sm text-white/60">
          This is a closed preview. Whatever you enter here is used only to show you your result in
          this session — no messages are sent and nothing is added to a marketing list.
        </p>
      </div>

      <Field label="First name" htmlFor="offerr-first-name">
        <input
          id="offerr-first-name"
          type="text"
          autoComplete="given-name"
          className={inputClass}
          placeholder="Optional"
          maxLength={80}
          value={contact.firstName}
          onChange={(e) => update("contact", { ...contact, firstName: e.target.value })}
        />
      </Field>

      <Field label="Email" error={fieldErrors["contact.email"] ?? null} htmlFor="offerr-email">
        <input
          id="offerr-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          spellCheck={false}
          className={inputClass}
          placeholder="Optional"
          maxLength={160}
          value={contact.email}
          onChange={(e) => update("contact", { ...contact, email: e.target.value })}
        />
      </Field>

      <Field label="Phone" htmlFor="offerr-phone">
        <input
          id="offerr-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className={inputClass}
          placeholder="Optional"
          maxLength={32}
          value={contact.phone}
          onChange={(e) => update("contact", { ...contact, phone: e.target.value })}
        />
      </Field>
    </StepShell>
  )
}
