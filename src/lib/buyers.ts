import { z } from 'zod'
import { PAN_ERROR, PAN_PATTERN } from '@/lib/companies'
import { PHONE_ERROR, normalizePhone } from '@/lib/phone'

/**
 * Editing a buyer of a sale. Client-safe: the edit screen and the API check the same rules, and the screen sends what
 * was typed (not what was parsed), so the server reads it exactly as the screen did.
 *
 * The PAN and Aadhaar are never sent to the screen, so a blank box means "keep what is saved".
 */
export const AADHAAR_ERROR = 'Please enter valid Aadhar number'
export const EMAIL_ERROR = 'Please enter a valid email address'

export const BuyerEditSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter the buyer name').max(200, 'The name is too long (maximum 200 characters)'),
  email: z.string().trim().email(EMAIL_ERROR).or(z.literal('')).nullish(),
  whatsappNumber: z.string().nullish().refine((v) => normalizePhone(v).ok, PHONE_ERROR),
  panNumber: z.string().trim().toUpperCase().regex(PAN_PATTERN, PAN_ERROR).or(z.literal('')).nullish(),
  aadhaarNumber: z.string().transform((v) => v.replace(/\s/g, '')).pipe(z.string().regex(/^\d{12}$/, AADHAAR_ERROR).or(z.literal(''))).nullish(),
  address: z.string().trim().max(500, 'The address is too long (maximum 500 characters)').nullish(),
  receiveComms: z.boolean(),
})
export type BuyerEditInput = z.input<typeof BuyerEditSchema>

/** Aadhaar as it is typed: digits only, in groups of four ("1234 5678 9012"). */
export function formatAadhaar(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 12)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}
