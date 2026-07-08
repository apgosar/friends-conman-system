/**
 * Calculates simple interest on overdue principal.
 * Rate: 12% per annum, applied after 30 days from demand generation date.
 */
export function calculateInterest({
  principalAmount,
  demandGeneratedDate,
  asOfDate = new Date(),
  ratePA = 12,
  gracePeriodDays = 30,
}: {
  principalAmount: number
  demandGeneratedDate: Date
  asOfDate?: Date
  ratePA?: number
  gracePeriodDays?: number
}): number {
  const demandDate = new Date(demandGeneratedDate)
  const graceCutoff = new Date(demandDate)
  graceCutoff.setDate(graceCutoff.getDate() + gracePeriodDays)

  if (asOfDate <= graceCutoff) return 0

  const daysOverdue = Math.floor(
    (asOfDate.getTime() - graceCutoff.getTime()) / (1000 * 60 * 60 * 24)
  )

  const interest = (principalAmount * ratePA * daysOverdue) / (100 * 365)
  return Math.round(interest * 100) / 100
}

/**
 * Determines the overdue bucket for a payment schedule.
 */
export function getOverdueBucket(demandGeneratedDate: Date | null, status: string): string {
  if (!demandGeneratedDate || status === 'PAID' || status === 'UPCOMING') return status
  const days = Math.floor(
    (Date.now() - new Date(demandGeneratedDate).getTime()) / (1000 * 60 * 60 * 24)
  )
  if (days <= 0) return 'DUE'
  if (days <= 7) return 'OVERDUE_7'
  if (days <= 15) return 'OVERDUE_15'
  if (days <= 30) return 'OVERDUE_30'
  return 'OVERDUE_30PLUS'
}
