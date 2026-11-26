/**
 * Demands waiting for management: the daily job flags a demand more than 30 days late (lib/scheduler.ts). The dashboard and
 * the Escalations screen list them from here, as plain rows that carry no personal data beyond the buyer's name.
 */

import { prisma } from '@/lib/db'
import { daysOverdue, outstandingAmount, ESCALATION_AFTER_DAYS, OUTSTANDING_PAYMENTS } from '@/lib/receivables'
import { activeSale } from '@/lib/soft-delete'

export interface EscalationRow {
  id: string
  saleId: string
  description: string
  projectName: string
  unitNumber: string
  buyerName: string
  dueDate: Date | null
  daysOverdue: number
  outstanding: number
  commsEnabled: boolean
  /** Management has sent the stern reminder */
  sternSent: boolean
}

export async function listEscalations(asOf: Date = new Date()): Promise<EscalationRow[]> {
  const schedules = await prisma.paymentSchedule.findMany({
    where: { managementEscalated: true, status: { notIn: ['PAID'] }, sale: activeSale },
    include: {
      payments: OUTSTANDING_PAYMENTS,
      sale: {
        select: {
          commsEnabled: true,
          unit: { select: { unitNumber: true } },
          buyers: { where: { isPrimary: true }, take: 1, select: { fullName: true } },
          project: { select: { name: true } },
        },
      },
    },
    orderBy: { demandGeneratedDate: 'asc' },
  })
  return schedules
    .map((s) => ({
      id: s.id,
      saleId: s.saleId,
      description: s.description,
      projectName: s.sale.project.name,
      unitNumber: s.sale.unit.unitNumber,
      buyerName: s.sale.buyers[0]?.fullName ?? '-',
      dueDate: s.dueDate,
      daysOverdue: daysOverdue(s, asOf),
      outstanding: outstandingAmount(s),
      commsEnabled: s.sale.commsEnabled,
      sternSent: s.managementApprovedStern,
    }))
    // Checked against today as well, so a flag set under an earlier rule (or before a due date moved) shows nothing
    .filter((row) => row.outstanding > 0 && (row.sternSent || row.daysOverdue > ESCALATION_AFTER_DAYS))
}
