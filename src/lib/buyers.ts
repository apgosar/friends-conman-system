import { z } from 'zod'
import { PAN_ERROR, PAN_PATTERN } from '@/lib/companies'
import { PHONE_ERROR, normalizePhone, whatsappDigits } from '@/lib/phone'

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

/**
 * An address kept on one line, broken into at most `max` lines for a letter: it is cut only after a comma, and the lines come out
 * about the same length. "7-C/34, Shree Jawahar CHS LTD, Sodawala Lane, Opp. Balwant Society, Govind Nagar Borivali (W) - 400092."
 * gives three lines, each ending at a comma but the last.
 */
export function addressLines(text: string | null | undefined, max = 3): string[] {
  const parts = (text ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return []
  const pieces = parts.map((p, i) => (i < parts.length - 1 ? `${p},` : p))
  const total = pieces.reduce((n, p) => n + p.length + 1, 0)
  const target = total / Math.max(1, max)
  const lines: string[] = []
  let line = ''
  pieces.forEach((piece, i) => {
    const left = pieces.length - i // pieces still to place, this one included
    const linesLeft = max - lines.length
    // start a new line when this one is long enough, or when every remaining piece needs a line of its own to fit
    if (line && linesLeft > 1 && (line.length + 1 + piece.length > target * 1.15 || left < linesLeft)) { lines.push(line); line = piece }
    else line = line ? `${line} ${piece}` : piece
  })
  if (line) lines.push(line)
  return lines
}

/** Aadhaar as it is typed: digits only, in groups of four ("1234 5678 9012"). */
export function formatAadhaar(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 12)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

/** A co-buyer who would get every message twice: same mobile number and/or email as a buyer before them who is contacted. */
export interface DuplicateContact { buyerId: string; name: string; sameAs: string; mobile: boolean; email: boolean }

/**
 * Buyers (other than the primary) who are contacted on a mobile number or email that an earlier contacted buyer already has, as
 * when a husband's details are typed for his wife too. Each demand letter and receipt would then reach the same phone or inbox
 * twice; turning communication off for the co-buyer stops that.
 */
export function duplicateContacts(buyers: { id: string; fullName: string; email: string | null; whatsappNumber: string | null; receiveComms: boolean; isPrimary: boolean }[]): DuplicateContact[] {
  const email = (v: string | null) => v?.trim().toLowerCase() || null
  const mobile = (v: string | null) => (v?.trim() ? whatsappDigits(v) : null)
  const out: DuplicateContact[] = []
  const contacted: typeof buyers = []
  for (const b of buyers) {
    if (!b.receiveComms) continue
    const twin = b.isPrimary ? undefined : contacted.find((c) => (mobile(b.whatsappNumber) && mobile(c.whatsappNumber) === mobile(b.whatsappNumber)) || (email(b.email) && email(c.email) === email(b.email)))
    if (twin) out.push({ buyerId: b.id, name: b.fullName, sameAs: twin.fullName, mobile: !!mobile(b.whatsappNumber) && mobile(twin.whatsappNumber) === mobile(b.whatsappNumber), email: !!email(b.email) && email(twin.email) === email(b.email) })
    contacted.push(b)
  }
  return out
}
