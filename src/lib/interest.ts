import { fromPaise, toPaise } from '@/lib/money'

/**
 * Interest on late demands. Simple interest on the principal still unpaid, calculated for every day a demand is late:
 *
 *   one day's interest = unpaid principal at the start of that day x rate / 365
 *
 * It starts the day after the demand's due date plus the grace days, and stops when the principal is cleared. A payment
 * dated on a day lowers the balance from the next day. GST is not charged interest. All arithmetic is in whole paise.
 * Client-safe and pure: the daily job, the payment screen and the documents all use these functions, so they cannot disagree.
 */

export interface InterestPolicy {
  enabled: boolean
  /** Per year, e.g. 12 */
  ratePercent: number
  /** Days after the due date before interest starts */
  graceDays: number
}

export const INTEREST_ORDERS = [
  { value: 'INTEREST_FIRST', label: 'Interest first, then GST, then principal' },
  { value: 'PRINCIPAL_FIRST', label: 'Principal and GST first, then interest' },
] as const
export type InterestOrder = (typeof INTEREST_ORDERS)[number]['value']

export const INTEREST_ON_DEMAND = [
  { value: 'WHEN_ACCRUED', label: 'Only when some interest has accrued' },
  { value: 'ALWAYS', label: 'Always (shows Rs. 0.00 before interest starts)' },
  { value: 'NEVER', label: 'Never' },
] as const
export type InterestOnDemand = (typeof INTEREST_ON_DEMAND)[number]['value']

/** A payment's effect on interest: the principal it cleared and when. */
export interface PrincipalPayment { date: Date; principal: number }

export interface InterestDemand { principalAmount: number; dueDate: Date | null; demandGeneratedDate?: Date | null }

export interface DailyAccrual { day: number; principalBase: number; amount: number }

const DAY_MS = 86_400_000
/** The business runs on Indian time: a "day" is an Indian calendar day. */
const IST_OFFSET_MS = 5.5 * 3_600_000

/** The calendar day of a moment, as a whole number of days (Indian time). */
export const dayOf = (d: Date): number => Math.floor((new Date(d).getTime() + IST_OFFSET_MS) / DAY_MS)
/** The date (midnight UTC) of a day number, for storing in a DATE column. */
export const dateOfDay = (day: number): Date => new Date(day * DAY_MS)

/** The last day of grace: interest starts the day after it. Null when the demand has no due date to count from. */
export function interestStartDay(demand: InterestDemand, policy: InterestPolicy): number | null {
  const from = demand.dueDate ?? demand.demandGeneratedDate ?? null
  return from ? dayOf(from) + policy.graceDays : null
}

/** The day each part-payment starts to count: the day after it was paid. */
const principalUnpaidAtStartOf = (day: number, demand: InterestDemand, payments: PrincipalPayment[]): number =>
  toPaise(demand.principalAmount) - payments.filter((p) => dayOf(p.date) < day).reduce((a, p) => a + toPaise(p.principal), 0)

/** One day's interest, or null when nothing accrues that day (interest off, still within grace, or principal cleared). */
export function accrualForDay(day: number, demand: InterestDemand, payments: PrincipalPayment[], policy: InterestPolicy): DailyAccrual | null {
  if (!policy.enabled || policy.ratePercent <= 0) return null
  const start = interestStartDay(demand, policy)
  if (start === null || day <= start) return null
  const basePaise = principalUnpaidAtStartOf(day, demand, payments)
  if (basePaise <= 0) return null
  return { day, principalBase: fromPaise(basePaise), amount: fromPaise(Math.round((basePaise * policy.ratePercent) / 36_500)) }
}

/** Every day's interest from the start of interest up to and including `asOf`. */
export function accrualsThrough(asOf: Date, demand: InterestDemand, payments: PrincipalPayment[], policy: InterestPolicy): DailyAccrual[] {
  const start = interestStartDay(demand, policy)
  if (!policy.enabled || start === null) return []
  const last = dayOf(asOf)
  const out: DailyAccrual[] = []
  for (let day = start + 1; day <= last; day++) {
    const a = accrualForDay(day, demand, payments, policy)
    if (a) out.push(a)
    else if (principalUnpaidAtStartOf(day, demand, payments) <= 0) break // the principal is cleared: nothing more will accrue
  }
  return out
}

export interface InterestStanding { accrued: number; paid: number; waived: number; outstanding: number }

/** Interest accrued up to `asOf`, what has been paid or waived, and what is still owed (never below zero). */
export function interestStanding(args: {
  asOf: Date
  demand: InterestDemand
  payments: PrincipalPayment[]
  interestPaid: number[]
  waivers: number[]
  policy: InterestPolicy
}): InterestStanding {
  const accrued = accrualsThrough(args.asOf, args.demand, args.payments, args.policy).reduce((a, d) => a + toPaise(d.amount), 0)
  const paid = args.interestPaid.reduce((a, v) => a + toPaise(v), 0)
  const waived = args.waivers.reduce((a, v) => a + toPaise(v), 0)
  return { accrued: fromPaise(accrued), paid: fromPaise(paid), waived: fromPaise(waived), outstanding: fromPaise(Math.max(0, accrued - paid - waived)) }
}

/**
 * How a payment of `total` is divided between interest, GST and principal, each limited to what is outstanding. With
 * INTEREST_FIRST the order is interest, GST, principal; with PRINCIPAL_FIRST it is principal, GST, interest. Anything
 * left over (more than is owed) is returned as `unapplied`.
 */
export function splitPayment(total: number, outstanding: { interest: number; gst: number; principal: number }, order: InterestOrder): { interest: number; gst: number; principal: number; unapplied: number } {
  let left = toPaise(total)
  const take = (owed: number) => { const t = Math.min(left, Math.max(0, toPaise(owed))); left -= t; return fromPaise(t) }
  const split = { interest: 0, gst: 0, principal: 0 }
  if (order === 'INTEREST_FIRST') { split.interest = take(outstanding.interest); split.gst = take(outstanding.gst); split.principal = take(outstanding.principal) }
  else { split.principal = take(outstanding.principal); split.gst = take(outstanding.gst); split.interest = take(outstanding.interest) }
  return { ...split, unapplied: fromPaise(left) }
}

/**
 * The overdue bucket of a demand, by days since its due date (since the demand was raised when it has no due date).
 * A demand that is paid or not yet demanded keeps its status.
 */
export function getOverdueBucket(dueDate: Date | null, demandGeneratedDate: Date | null, status: string, asOf: Date = new Date()): string {
  const from = dueDate ?? demandGeneratedDate
  if (!from || status === 'PAID' || status === 'UPCOMING') return status
  const days = dayOf(asOf) - dayOf(from)
  if (days <= 0) return status === 'PARTIALLY_PAID' ? status : 'DUE'
  if (days <= 7) return 'OVERDUE_7'
  if (days <= 15) return 'OVERDUE_15'
  if (days <= 30) return 'OVERDUE_30'
  return 'OVERDUE_30PLUS'
}

/** "Interest @ 12% p.a. is charged on a payment received after 28/11/2026" for a demand letter. */
export function interestNote(policy: InterestPolicy, startDay: number | null, formatDay: (d: Date) => string): string {
  if (!policy.enabled || policy.ratePercent <= 0 || startDay === null) return ''
  return `Interest @ ${policy.ratePercent}% p.a. is charged on a payment received after ${formatDay(dateOfDay(startDay))}`
}

/** A demand as the screens hold it: its payments (live and deleted), and any interest waived. Dates may be ISO strings. */
export interface ScheduleForInterest {
  principalAmount: number | string
  dueDate?: Date | string | null
  demandGeneratedDate?: Date | string | null
  status: string
  payments?: { amount: number | string; interestPaid?: number | string | null; paymentDate: Date | string; deletedAt?: unknown }[]
  interestWaivers?: { amount: number | string }[]
}

/** The interest standing of one demand today (or `asOf`). A demand not yet raised carries none. */
export function standingOfSchedule(s: ScheduleForInterest, policy: InterestPolicy, asOf: Date = new Date()): InterestStanding {
  if (s.status === 'UPCOMING') return { accrued: 0, paid: 0, waived: 0, outstanding: 0 }
  const live = (s.payments ?? []).filter((p) => !p.deletedAt)
  return interestStanding({
    asOf,
    demand: { principalAmount: Number(s.principalAmount), dueDate: s.dueDate ? new Date(s.dueDate) : null, demandGeneratedDate: s.demandGeneratedDate ? new Date(s.demandGeneratedDate) : null },
    payments: live.map((p) => ({ date: new Date(p.paymentDate), principal: Number(p.amount) })),
    interestPaid: live.map((p) => Number(p.interestPaid ?? 0)),
    waivers: (s.interestWaivers ?? []).map((w) => Number(w.amount)),
    policy,
  })
}

/** The project columns the screens need to work with interest. */
export interface ProjectInterestFields {
  interestEnabled: boolean
  interestRatePercent: number
  interestGraceDays: number
  interestDefaultOrder: string
  interestOnDemand: string
}

/** A project's interest settings as the policy the functions above take, with what a payment clears first and what a letter shows. */
export const interestPolicyOf = (p: ProjectInterestFields): InterestPolicy & { defaultOrder: InterestOrder; onDemand: InterestOnDemand } => ({
  enabled: p.interestEnabled,
  ratePercent: p.interestRatePercent,
  graceDays: p.interestGraceDays,
  defaultOrder: p.interestDefaultOrder === 'PRINCIPAL_FIRST' ? 'PRINCIPAL_FIRST' : 'INTEREST_FIRST',
  onDemand: p.interestOnDemand === 'ALWAYS' || p.interestOnDemand === 'NEVER' ? p.interestOnDemand : 'WHEN_ACCRUED',
})

/** Attaches a project's interest settings to each demand, so the client screens can work out what is owed on a given day. */
export const withInterestPolicy = <T extends object>(schedules: T[], project: ProjectInterestFields) => {
  const interestPolicy = interestPolicyOf(project)
  return schedules.map((s) => ({ ...s, interestPolicy }))
}
