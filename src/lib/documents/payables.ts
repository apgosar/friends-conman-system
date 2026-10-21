import { formatNumber } from '@/lib/format'

/**
 * The PAYABLES table of the sale agreement (section 17: charges the Allottee pays before possession). Two rows depend on the
 * unit, the rest are fixed amounts printed in the agreement template. The total is worked out here so it always agrees with the
 * rows.
 *
 *  - MCGM Development and Betterment charges: Rs. 600 for every sq. ft. of the RERA carpet area
 *  - Common area (gymnasium, other amenities) charges: Rs. 1,00,000 for a residential unit, nil for a commercial one
 *
 * If the fixed amounts in the template's table ever change, change FIXED_PAYABLES to match (they are added to the total).
 */
export const MCGM_CHARGE_PER_SQFT = 600
export const COMMON_AREA_CHARGE_RESIDENTIAL = 100_000

/** Share money 600, monthly contribution 1,00,000, utilities 25,000, sub-station 25,000, society formation 25,000, legal 15,000. */
export const FIXED_PAYABLES = [600, 100_000, 25_000, 25_000, 25_000, 15_000]

export interface Payables {
  mcgm: number
  commonArea: number
  total: number
}

export function agreementPayables(carpetAreaSqft: number, commercial: boolean): Payables {
  const mcgm = Math.round(MCGM_CHARGE_PER_SQFT * carpetAreaSqft)
  const commonArea = commercial ? 0 : COMMON_AREA_CHARGE_RESIDENTIAL
  const total = FIXED_PAYABLES.reduce((sum, n) => sum + n, 0) + mcgm + commonArea
  return { mcgm, commonArea, total }
}

/** "Rs. 4,50,000/-", the way an amount reads in the agreement's table. */
export const rsText = (n: number): string => `Rs. ${formatNumber(n, 0)}/-`
