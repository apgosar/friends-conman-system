import { prisma, type DbTransaction } from '@/lib/db'
import type { SaleLifecycleStatus } from '@/lib/status'

interface LifecycleInput {
  agreementDate: Date | null
  possessionDate: Date | null
  paymentSchedules: { status: string }[]
}

/**
 * Derive the lifecycle status of an active sale from facts recorded in the system:
 *   handover date          → HANDOVER_COMPLETED
 *   every demand PAID      → ALL_PAID
 *   agreement + 2nd demand → IN_PROGRESS   (booking demand + at least one more raised)
 *   agreement date         → AGREEMENT_DONE
 *   otherwise              → BOOKED
 */
export function deriveSaleStatus(sale: LifecycleInput): SaleLifecycleStatus {
  const schedules = sale.paymentSchedules
  if (sale.possessionDate) return 'HANDOVER_COMPLETED'
  if (schedules.length > 0 && schedules.every((s) => s.status === 'PAID')) return 'ALL_PAID'
  if (sale.agreementDate) {
    const raised = schedules.filter((s) => s.status !== 'UPCOMING').length
    return raised >= 2 ? 'IN_PROGRESS' : 'AGREEMENT_DONE'
  }
  return 'BOOKED'
}

/**
 * Recompute a sale's status and mirror it onto its unit. Call after anything that can change it:
 * payment recorded, milestone completed (demands raised), agreement / handover dates edited.
 * Cancelled / deleted sales are left alone (see lib/soft-delete.ts, which releases the unit).
 */
export async function syncSaleLifecycle(saleId: string, db: DbTransaction | typeof prisma = prisma): Promise<SaleLifecycleStatus | null> {
  const sale = await db.sale.findUnique({
    where: { id: saleId },
    select: {
      status: true, unitId: true, deletedAt: true, agreementDate: true, possessionDate: true,
      paymentSchedules: { select: { status: true } },
    },
  })
  if (!sale || sale.deletedAt || sale.status === 'CANCELLED') return null

  const next = deriveSaleStatus(sale)
  if (next !== sale.status) await db.sale.update({ where: { id: saleId }, data: { status: next } })
  await db.unit.updateMany({ where: { id: sale.unitId, OR: [{ status: { not: next } }, { statusManual: true }] }, data: { status: next, statusManual: false, bookedByName: null, bookedByMobile: null } })
  return next
}
