/**
 * Seller-safe intake validation.
 *
 * Two rules shape this schema:
 *
 * 1. The browser may describe a PROPERTY BY ADDRESS ONLY. It may never send a
 *    property id, export id, or any other canonical identifier — accepting one
 *    would let a caller point the evaluation at an arbitrary record instead of
 *    the one they actually control. Identity is resolved server-side, from the
 *    address, by the internal spine.
 *
 * 2. Every seller answer is an UNVERIFIED CLAIM. Nothing here is treated as
 *    fact; the schema exists to bound and shape the claim overlay, not to
 *    establish truth.
 */

import { z } from 'zod';

/** Matches the internal spine's own bound so we reject before the network hop. */
export const MAX_ADDRESS_LENGTH = 240;
export const MAX_REQUEST_BYTES = 16 * 1024;

const trimmed = (max: number) => z.string().trim().max(max);

export const propertyStepSchema = z.object({
  address: trimmed(MAX_ADDRESS_LENGTH).min(6, 'Enter the full property address'),
  unit: trimmed(24).optional().or(z.literal('')),
});

export const contextStepSchema = z.object({
  propertyType: z.enum(['single_family', 'condo', 'townhouse', 'multi_family_2_4', 'other']),
  occupancy: z.enum(['owner_occupied', 'tenant_occupied', 'vacant']),
  condition: z.enum(['excellent', 'good', 'fair', 'poor']),
  repairLevel: z.enum(['none', 'cosmetic', 'moderate', 'major']),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  bathrooms: z.coerce.number().min(0).max(20).optional(),
  units: z.coerce.number().int().min(1).max(4).optional(),
  majorUpdates: z.array(z.enum(['roof', 'hvac', 'kitchen', 'bath', 'windows', 'electrical', 'plumbing'])).max(7).optional(),
  knownDamage: trimmed(400).optional().or(z.literal('')),
});

export const situationStepSchema = z.object({
  timeline: z.enum(['asap', 'within_30_days', 'within_90_days', 'just_exploring']),
  askingPrice: z.coerce.number().min(0).max(100_000_000).optional(),
  reason: z.enum(['relocation', 'inherited', 'financial', 'tired_of_managing', 'downsizing', 'other', 'prefer_not_to_say']).optional(),
  isListed: z.boolean(),
  /**
   * Preliminary, non-legal. Deliberately a plain acknowledgement rather than an
   * ownership or title assertion — we are not qualified to collect the latter
   * at this stage and must not imply that we have.
   */
  decisionMaker: z.enum(['yes', 'one_of_several', 'no']),
});

export const contactStepSchema = z.object({
  // Optional in the closed preview: nothing is sent to a seller, so requiring
  // contact details would be collecting data we have no current use for.
  firstName: trimmed(80).optional().or(z.literal('')),
  email: z.string().trim().email().max(160).optional().or(z.literal('')),
  phone: trimmed(32).optional().or(z.literal('')),
});

export const consentSchema = z.object({
  /** Consent to EVALUATE. Deliberately not bundled with marketing consent. */
  evaluationConsent: z.literal(true, {
    errorMap: () => ({ message: 'Please confirm you would like us to evaluate this property' }),
  }),
});

export const intakeSubmissionSchema = z.object({
  property: propertyStepSchema,
  context: contextStepSchema,
  situation: situationStepSchema,
  contact: contactStepSchema.optional(),
  consent: consentSchema,
  /**
   * Bot trap. A real browser never fills this — it is visually hidden and
   * aria-hidden. Any value at all means the submission is discarded.
   */
  companyWebsite: z.string().max(200).optional(),
});

export type IntakeSubmission = z.infer<typeof intakeSubmissionSchema>;

/**
 * Build the seller-fact overlay sent upstream. Contact details are deliberately
 * EXCLUDED: the evaluation does not use them, and forwarding PII that has no
 * effect on the result would be collecting exposure for nothing.
 */
export function toSellerFacts(submission: IntakeSubmission) {
  const { context, situation } = submission;
  return {
    property_type: { value: context.propertyType, source: 'seller_claim' },
    occupancy: { value: context.occupancy, source: 'seller_claim' },
    condition: { value: context.condition, source: 'seller_claim' },
    repairs: { value: { level: context.repairLevel }, source: 'seller_claim' },
    ...(context.bedrooms !== undefined ? { bedrooms: { value: context.bedrooms, source: 'seller_claim' } } : {}),
    ...(context.bathrooms !== undefined ? { bathrooms: { value: context.bathrooms, source: 'seller_claim' } } : {}),
    ...(context.units !== undefined ? { units: { value: context.units, source: 'seller_claim' } } : {}),
    ...(context.majorUpdates?.length ? { major_updates: { value: context.majorUpdates, source: 'seller_claim' } } : {}),
    ...(context.knownDamage ? { known_damage: { value: context.knownDamage, source: 'seller_claim' } } : {}),
    timeline: { value: situation.timeline, source: 'seller_claim' },
    ...(situation.askingPrice !== undefined ? { asking_price: { value: situation.askingPrice, source: 'seller_claim' } } : {}),
    ...(situation.reason && situation.reason !== 'prefer_not_to_say'
      ? { reason: { value: situation.reason, source: 'seller_claim' } }
      : {}),
    is_listed: { value: situation.isListed, source: 'seller_claim' },
    decision_maker: { value: situation.decisionMaker, source: 'seller_claim' },
  };
}

/** Normalized address string sent upstream (unit folded in when given). */
export function composeAddress(property: { address: string; unit?: string }): string {
  const unit = String(property.unit ?? '').trim();
  const address = String(property.address ?? '').trim();
  if (!unit) return address;
  // Insert the unit after the street segment so the internal parser sees a
  // designator it recognises rather than a trailing token.
  const [street, ...rest] = address.split(',');
  const withUnit = `${street.trim()} Unit ${unit}`;
  return rest.length ? `${withUnit}, ${rest.join(',').trim()}` : withUnit;
}
