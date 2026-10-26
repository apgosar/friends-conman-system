import { z } from 'zod'
import { normalizePhoneList } from '@/lib/phone'

/**
 * The developer company of an installation and its partners. Client-safe: the Companies screen, the project forms, the
 * agreement screens and the API share these rules.
 */

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

export const PAN_ERROR = 'Please enter valid PAN number'
export const GSTIN_ERROR = 'Please enter valid GSTIN'

const text = (label: string, max: number) => z.string().trim().min(1, `Enter ${label}`).max(max, `${label} is too long (maximum ${max} characters)`)
// Left out = unchanged (an edit that does not touch the PAN); empty = no PAN
// null is accepted too: the screen sends back what it parsed, and an empty PAN is parsed to null
const optionalPan = z.string().nullish()
  .transform((v) => (v === undefined ? undefined : (v?.trim().toUpperCase() || null)))
  .pipe(z.string().regex(PAN_PATTERN, PAN_ERROR).nullable().optional())

/** The contact numbers box: one or several numbers, checked and tidied; blank is no numbers. */
export const CONTACT_NUMBERS_ERROR = 'Enter valid mobile numbers, separated by commas'
export const contactNumbers = z.string().nullish().transform((v, ctx) => {
  const list = normalizePhoneList(v)
  if (!list.ok) { ctx.addIssue({ code: 'custom', message: CONTACT_NUMBERS_ERROR }); return z.NEVER }
  return list.value
})

/** Room the letterhead needs at the top or bottom of a quotation page, in millimetres. */
const margin = (label: string) =>
  z.union([z.number(), z.string().trim().min(1, `Enter the ${label}`).transform(Number)], { message: `Enter the ${label}` })
    .pipe(z.number({ message: `The ${label} must be a number` }).int(`The ${label} must be a whole number`).min(0, `The ${label} cannot be negative`).max(120, `The ${label} cannot be more than 120 mm`))

export const CompanySchema = z.object({
  name: text('the company name', 200),
  panNumber: z.string().trim().toUpperCase().regex(PAN_PATTERN, PAN_ERROR),
  gstin: z.string().trim().toUpperCase().transform((v) => v || null).pipe(z.string().regex(GSTIN_PATTERN, GSTIN_ERROR).nullable()),
  address: text('the company address', 500),
  contactNumbers: contactNumbers.optional(), // left out = unchanged
  quoteMarginTopMm: margin('top margin').optional(),
  quoteMarginBottomMm: margin('bottom margin').optional(),
})
export type CompanyInput = z.infer<typeof CompanySchema>

export const PartnerSchema = z.object({
  name: text('the partner name', 200),
  panNumber: optionalPan,
  address: z.string().nullish().transform((v) => v?.trim() ?? '').pipe(z.string().max(500, 'The address is too long (maximum 500 characters)')).transform((v) => v || null),
  isActive: z.boolean().optional(),
})
export type PartnerInput = z.infer<typeof PartnerSchema>

/**
 * Which partners go into a sale agreement: any number of the company's active partners, but at least one when the company
 * has partners (with none the agreement is made without partner names; the screen warns). Returns an error text, or null.
 */
export function checkAgreementPartners(activePartnerIds: string[], chosen: string[]): string | null {
  const distinct = new Set(chosen)
  if (distinct.size !== chosen.length) return 'Choose different partners'
  if (!chosen.every((id) => activePartnerIds.includes(id))) return 'Choose partners of this company who are still active'
  if (activePartnerIds.length > 0 && chosen.length === 0) return 'Choose at least one partner for the agreement'
  return null
}

/** Documents that name the company's partners. */
export const PARTNER_DOCUMENT_TYPES = ['SALE_AGREEMENT', 'PAAA']
export const namesPartners = (documentType: string) => PARTNER_DOCUMENT_TYPES.includes(documentType)
