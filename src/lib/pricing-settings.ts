import { z } from 'zod'

/**
 * Validation for the per-project tax and pricing settings (Edit project). Accepts numbers or numeric strings, because the
 * New Project form posts raw form values. A blank registration cap means "no cap".
 */
const percent = (label: string) =>
  z.union([z.number(), z.string().trim().min(1).transform(Number)], { message: `${label} is required` })
    .pipe(z.number({ message: `${label} must be a number` }).finite(`${label} must be a number`).min(0, `${label} cannot be negative`).max(100, `${label} cannot be more than 100`))

const rupees = (label: string) =>
  z.union([z.number(), z.string().trim().min(1).transform(Number)], { message: `${label} is required` })
    .pipe(z.number({ message: `${label} must be a number` }).finite(`${label} must be a number`).min(0, `${label} cannot be negative`).max(1_000_000_000, `${label} is too large`))

export const PricingSettingsSchema = z.object({
  gstRatePercent: percent('GST rate').optional(),
  stampDutyPercent: percent('Stamp duty').optional(),
  regChargesPercent: percent('Registration charges').optional(),
  tdsRatePercent: percent('TDS rate').optional(),
  interestRatePercent: percent('Interest rate').optional(),
  regParkingCharges: rupees('Registration charge for parking').optional(),
  regChargesCap: z.union([z.literal(''), z.null(), rupees('Registration charges cap')]).transform((v) => (v === '' ? null : v)).optional(),
})

export type PricingSettingsInput = z.infer<typeof PricingSettingsSchema>

/** Picks the pricing fields out of a request body. Missing fields stay missing (so a PATCH only changes what it sends). */
export function parsePricingSettings(body: unknown): { data: PricingSettingsInput; error?: undefined } | { data?: undefined; error: string } {
  const source = (body ?? {}) as Record<string, unknown>
  const picked = Object.fromEntries(Object.keys(PricingSettingsSchema.shape).filter((k) => source[k] !== undefined).map((k) => [k, source[k]]))
  const result = PricingSettingsSchema.safeParse(picked)
  if (!result.success) return { error: result.error.issues[0]?.message ?? 'Check the tax and pricing settings' }
  return { data: result.data }
}
