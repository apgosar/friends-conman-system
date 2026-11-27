import { notDeleted } from '@/lib/soft-delete'
import { TDS_MODE } from '@/lib/status'

/**
 * How many times a buyer has paid on a sale: one per receipt that still stands. A receipt spread over several demands is
 * one payment; a reversed payment and a TDS credit (not money received) are none.
 */

/** Use as `payments:` in a Sale query, then pass what comes back to `receiptCount` */
export const RECEIVED_PAYMENTS = { where: { ...notDeleted, mode: { not: TDS_MODE } }, select: { receiptNumber: true } } as const

export const receiptCount = (payments: { receiptNumber: string }[]): number => new Set(payments.map((p) => p.receiptNumber)).size
