"use client"

/**
 * Step 1 — Property.
 *
 * Deliberately does NOT claim the property is identified. There is no
 * "we found your home" moment here, no confirmed record, no photo, no
 * inferred details — the backend has not been asked yet, and pretending
 * otherwise would be inventing certainty the seller would reasonably rely on.
 *
 * The address field is a plain text input with the browser's own autofill
 * enabled (`autoComplete="street-address"`). No third-party autocomplete is
 * wired: that would send every keystroke of a seller's address to an external
 * provider before they have consented to anything.
 */

import { useEffect, useRef, useState } from "react"
import { Field, PrimaryButton, StepShell, inputClass, describedBy } from "./journey-chrome"
import type { JourneyDraft } from "./journey"
import { track } from "@/lib/offerr/analytics"

export function StepProperty({
  draft,
  update,
  fieldErrors,
  onNext,
}: {
  draft: JourneyDraft
  update: <K extends keyof JourneyDraft>(key: K, value: JourneyDraft[K]) => void
  fieldErrors: Record<string, string>
  onNext: () => void
}) {
  const [touched, setTouched] = useState(false)
  const startedRef = useRef(false)
  const address = draft.property.address
  const unit = draft.property.unit

  useEffect(() => {
    if (!startedRef.current && address.trim().length > 0) {
      startedRef.current = true
      track("address_started")
    }
  }, [address])

  const localError =
    touched && address.trim().length < 6 ? "Enter the full property address" : null
  const error = localError ?? fieldErrors["property.address"] ?? null

  const submit = () => {
    setTouched(true)
    if (address.trim().length < 6) return
    track("property_step_completed")
    onNext()
  }

  return (
    <StepShell
      title="What property are we looking at?"
      intro="Start with the address. We will confirm exactly which property it is once you submit — nothing is looked up while you type."
      footer={
        <div className="flex flex-col gap-3 sm:flex-row">
          <PrimaryButton onClick={submit}>Continue</PrimaryButton>
        </div>
      }
    >
      <Field label="Property address" error={error} htmlFor="offerr-address">
        <input
          id="offerr-address"
          name="address"
          type="text"
          inputMode="text"
          autoComplete="street-address"
          autoCapitalize="words"
          spellCheck={false}
          className={inputClass}
          placeholder="123 Main St, Houston, TX 77035"
          value={address}
          maxLength={240}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy("offerr-address", { hasError: Boolean(error) })}
          onChange={(event) => update("property", { ...draft.property, address: event.target.value })}
          onBlur={() => setTouched(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              submit()
            }
          }}
        />
      </Field>

      <Field
        label="Unit or apartment (if any)"
        hint="Only if the property has one. Leaving it out when it is needed means we will ask again."
        htmlFor="offerr-unit"
      >
        <input
          id="offerr-unit"
          name="unit"
          type="text"
          autoComplete="address-line2"
          className={inputClass}
          placeholder="Apt 4B"
          value={unit}
          maxLength={24}
          aria-describedby={describedBy("offerr-unit", { hasHint: true })}
          onChange={(event) => update("property", { ...draft.property, unit: event.target.value })}
        />
      </Field>
    </StepShell>
  )
}
