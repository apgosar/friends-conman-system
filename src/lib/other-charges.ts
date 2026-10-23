import { z } from 'zod'
import { formatNumber } from '@/lib/format'
import { round2, sumRupees } from '@/lib/money'

/**
 * Other charges: the amounts a buyer pays besides the price, due with the last milestone (Possession / OC): society share
 * money, deposits, the MCGM betterment charge, legal charges... They are set per project, copied onto each sale when it is
 * made (so a later change to the project does not change an old sale) and printed in the PAYABLES table of the agreement.
 * Client-safe: the project screen, the new-sale review and the server share these rules.
 */

/** The one schedule row that carries all the other charges of a sale. */
export const OTHER_CHARGES_LABEL = 'Other Charges'

export const AMOUNT_TYPES = [
  { value: 'FIXED', label: 'Fixed amount (₹)' },
  { value: 'PER_SQFT', label: 'Rate per sq ft (₹)' },
  { value: 'AS_DETERMINED', label: 'As determined later' },
] as const
export const APPLIES_TO = [
  { value: 'BOTH', label: 'Residential and commercial' },
  { value: 'RESIDENTIAL', label: 'Residential only' },
  { value: 'COMMERCIAL', label: 'Commercial only' },
] as const
export type AmountType = (typeof AMOUNT_TYPES)[number]['value']
export type AppliesTo = (typeof APPLIES_TO)[number]['value']

export const AS_DETERMINED_TEXT = 'As Determined at the time of assessment'
export const NIL_TEXT = 'Nil'

export interface ChargeDefinition { name: string; amountType: string; amount: number; appliesTo: string }

/** One charge as it applies to a particular unit. `amount` is null when nothing is payable (Nil, or to be determined). */
export interface ChargeItem { name: string; amountType: string; rate: number; amount: number | null; text: string }

export const ChargeSchema = z.object({
  name: z.string().trim().min(1, 'Enter the name of the charge').max(500, 'The name is too long (maximum 500 characters)'),
  amountType: z.enum(['FIXED', 'PER_SQFT', 'AS_DETERMINED']),
  amount: z.union([z.number(), z.string().trim().min(1).transform(Number)]).pipe(z.number().finite('Enter a valid amount').min(0, 'The amount cannot be negative').max(1_000_000_000, 'The amount is too large')),
  appliesTo: z.enum(['BOTH', 'RESIDENTIAL', 'COMMERCIAL']),
}).refine((c) => c.amountType === 'AS_DETERMINED' || c.amount > 0, { message: 'Enter the amount', path: ['amount'] })

/** "Rs. 4,98,000/-" as the agreement prints an amount. */
export const rsText = (rupees: number): string => `Rs. ${formatNumber(rupees, 0)}/-`

/** What a project starts with: the charges of the PAYABLES table of the sale agreement. */
export const DEFAULT_OTHER_CHARGES: ChargeDefinition[] = [
  { name: 'Share Money, Application for Membership, Entrance fees of the Society or Body Corporate or Limited Company, Federation/Apex Body (Accountable)', amountType: 'FIXED', amount: 600, appliesTo: 'BOTH' },
  { name: 'Proportionate share of taxes and other charges/levies in respect of the building in which the Office/Shop is situated for 12 months. (Accountable)', amountType: 'AS_DETERMINED', amount: 0, appliesTo: 'BOTH' },
  { name: 'Provisional monthly contribution for outgoings of the Society/Body Corporate for 12 months. (Accountable)', amountType: 'FIXED', amount: 100000, appliesTo: 'BOTH' },
  { name: 'Charges Payable towards Water, Electric and other Utility and Service Connection. (Non-Accountable)', amountType: 'FIXED', amount: 25000, appliesTo: 'BOTH' },
  { name: 'Charges Payable for electrical receiving and Sub-Station provided in the Layout. (Non-Accountable)', amountType: 'FIXED', amount: 25000, appliesTo: 'BOTH' },
  { name: 'MCGM Development and Betterment charges @ Rs.600/- per sq. feet (Non-Accountable)', amountType: 'PER_SQFT', amount: 600, appliesTo: 'BOTH' },
  { name: 'Formation and registration of the Society or Association or Limited Company, Federation/Apex Body including for meeting all legal cost charges and expenses, professional fees payable to the Advocates of the Promoters in connection with formation of Society or Association or Limited Company, Federation/Apex Body and for preparation of Bye-Laws, Rules and Regulations, Memorandum & Articles of Associations, etc. (Non-Accountable)', amountType: 'FIXED', amount: 25000, appliesTo: 'BOTH' },
  { name: 'Legal charges for this Agreement (Non-Accountable)', amountType: 'FIXED', amount: 15000, appliesTo: 'BOTH' },
  { name: 'Common Area (Gymnasium, Other Amenities) charges (Non-Accountable)', amountType: 'FIXED', amount: 100000, appliesTo: 'RESIDENTIAL' },
]

/**
 * The charges as they apply to one unit: a rate per sq ft is worked out on the RERA carpet area, a charge for the other
 * kind of unit is Nil, and one to be determined has no amount. `total` is what falls due with the last milestone.
 */
export function computeOtherCharges(charges: ChargeDefinition[], unit: { carpetAreaSqft: number; commercial: boolean }): { items: ChargeItem[]; total: number } {
  const items: ChargeItem[] = charges.map((c) => {
    const applies = c.appliesTo === 'BOTH' || (c.appliesTo === 'COMMERCIAL') === unit.commercial
    const rate = Number(c.amount)
    if (!applies) return { name: c.name, amountType: c.amountType, rate, amount: null, text: NIL_TEXT }
    if (c.amountType === 'AS_DETERMINED') return { name: c.name, amountType: c.amountType, rate, amount: null, text: AS_DETERMINED_TEXT }
    const amount = c.amountType === 'PER_SQFT' ? round2(rate * unit.carpetAreaSqft) : round2(rate)
    return { name: c.name, amountType: c.amountType, rate, amount, text: amount > 0 ? rsText(amount) : NIL_TEXT }
  })
  return { items, total: sumRupees(items.map((i) => i.amount)) }
}
