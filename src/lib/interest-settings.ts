import { z } from 'zod'
import { INTEREST_ON_DEMAND, INTEREST_ORDERS } from '@/lib/interest'

/**
 * A project's interest settings (Edit project > Interest). Client-safe: the screen and the API check the same rules.
 * Numbers may arrive as text from a form.
 */
const number = (label: string, min: number, max: number) =>
  z.union([z.number(), z.string().trim().min(1, `Enter ${label}`).transform(Number)], { message: `Enter ${label}` })
    .pipe(z.number({ message: `${label} must be a number` }).finite(`${label} must be a number`).min(min, `${label} cannot be less than ${min}`).max(max, `${label} cannot be more than ${max}`))

export const InterestSettingsSchema = z.object({
  interestEnabled: z.boolean(),
  interestRatePercent: number('the interest rate', 0, 100),
  interestGraceDays: number('the grace days', 0, 365).pipe(z.number().int('Grace days must be a whole number')),
  interestDefaultOrder: z.enum(INTEREST_ORDERS.map((o) => o.value) as [string, ...string[]]),
  interestOnDemand: z.enum(INTEREST_ON_DEMAND.map((o) => o.value) as [string, ...string[]]),
})
export type InterestSettingsInput = z.infer<typeof InterestSettingsSchema>
