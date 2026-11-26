/**
 * What is still owed on a demand and how late it is: the one place the dashboard, receivables, reports, escalations, the
 * weekly reminders and the stern reminder work both out. Days are calendar days in India, counted from the due date (from
 * the day the demand was raised when it has none), the same way the daily job sets the overdue status.
 */

import { dayOf } from '@/lib/interest'
import { fromPaise, toPaise } from '@/lib/money'

export interface DemandAmounts {
  principalAmount: unknown
  gstAmount: unknown
  interestAmount: unknown
  /** The payments of the demand that count: deleted (reversed) ones left out */
  payments: { amount: unknown; gstPaid: unknown }[]
}

/** The payments to load with a demand so that its outstanding amount can be worked out. */
export const OUTSTANDING_PAYMENTS = { where: { deletedAt: null }, select: { amount: true, gstPaid: true } } as const

/** What is still owed on a demand, in paise: its unpaid principal and GST, and the interest owed on it. */
export function outstandingOf(s: DemandAmounts) {
  const principal = Math.max(0, toPaise(Number(s.principalAmount)) - s.payments.reduce((t, p) => t + toPaise(Number(p.amount)), 0))
  const gst = Math.max(0, toPaise(Number(s.gstAmount)) - s.payments.reduce((t, p) => t + toPaise(Number(p.gstPaid)), 0))
  const interest = Math.max(0, toPaise(Number(s.interestAmount)))
  return { principal, gst, interest, total: principal + gst + interest }
}

/** The same total in rupees, for showing. */
export const outstandingAmount = (s: DemandAmounts): number => fromPaise(outstandingOf(s).total)

/** Whole days past the due date; 0 on the due date and before it. */
export function daysOverdue(s: { dueDate: Date | null; demandGeneratedDate?: Date | null }, asOf: Date = new Date()): number {
  const from = s.dueDate ?? s.demandGeneratedDate
  return from ? Math.max(0, dayOf(asOf) - dayOf(from)) : 0
}

/** Management steps in (escalation and the stern reminder) only when a demand is MORE than this many days overdue. */
export const ESCALATION_AFTER_DAYS = 30

export type AgingBucket = 'current' | '8-15' | '16-30' | '30plus'

/** The ageing group of the dashboard and the receivables screen. */
export function agingBucket(days: number): AgingBucket {
  if (days <= 7) return 'current'
  if (days <= 15) return '8-15'
  return days <= 30 ? '16-30' : '30plus'
}
