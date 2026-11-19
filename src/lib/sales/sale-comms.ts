/**
 * Whether the application sends a sale's buyers their messages. A new sale starts with this off, so nothing reaches a buyer
 * before the details are right; an administrator turns it on from the sale page.
 *
 * Turning it on: what was held while it was off is not sent (it may carry amounts that have since been corrected). Instead each
 * buyer who agreed to be contacted gets a fresh demand letter for every demand already raised that still has something to pay,
 * made from the sale as it is now. Turning it off only stops what is sent from then on.
 */

import type { Prisma } from '@prisma/client'
import { transaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { activeSale } from '@/lib/soft-delete'
import { fromPaise, toPaise } from '@/lib/money'
import { buildCommContent, sanitizeInline } from '@/lib/comms-content'
import { formatDate, formatRupees } from '@/lib/format'
import { isOfflineCharge } from '@/lib/payment-plans'

/** The message that goes with a demand letter when communication is turned on. */
export function demandNoticeText(args: { buyerName: string; unitNumber: string; description: string; balance: number; dueDate: Date | null }): string {
  return `Dear ${sanitizeInline(args.buyerName) || 'Customer'},\nPayment for '${sanitizeInline(args.description)}' for unit ${sanitizeInline(args.unitNumber)} is due. Please find the attached Demand Letter for ${formatRupees(args.balance)}.\nDue Date: ${args.dueDate ? formatDate(args.dueDate) : 'N/A'}.`
}

export async function setSaleCommunication(saleId: string, enabled: boolean, actorId: string): Promise<{ enabled: boolean; letters: number }> {
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales WHERE id = ${saleId} FOR UPDATE`
    const sale = await tx.sale.findFirst({
      where: { id: saleId, ...activeSale },
      include: {
        unit: { select: { unitNumber: true } },
        buyers: { where: { receiveComms: true }, orderBy: { sequence: 'asc' } },
        paymentSchedules: { include: { payments: { where: { deletedAt: null }, select: { amount: true, gstPaid: true } } } },
      },
    })
    if (!sale) throw fail('notFound', 'Sale not found, or it has been cancelled')
    if (sale.status === 'CANCELLED') throw fail('invalid', 'A cancelled sale cannot send messages')

    let letters = 0
    if (enabled !== sale.commsEnabled) {
      await tx.sale.update({ where: { id: sale.id }, data: { commsEnabled: enabled } })

      if (enabled) {
        await tx.communicationLog.updateMany({ where: { saleId: sale.id, status: 'HELD' }, data: { status: 'SKIPPED' } })
        const logs: Prisma.CommunicationLogCreateManyInput[] = []
        for (const s of sale.paymentSchedules) {
          if (!s.demandGeneratedDate || s.status === 'PAID' || isOfflineCharge(s.description)) continue // not raised yet, settled, or paid outside the application
          const paid = s.payments.reduce((t, p) => t + toPaise(Number(p.amount)) + toPaise(Number(p.gstPaid)), 0)
          const balance = fromPaise(Math.max(0, toPaise(Number(s.principalAmount)) + toPaise(Number(s.gstAmount)) - paid))
          if (balance <= 0) continue
          const letter = { label: 'Demand Letter', path: `/api/documents/preview/demand-letter?saleId=${sale.id}&milestoneName=${encodeURIComponent(s.description)}` }
          for (const buyer of sale.buyers) {
            const { messageContent, attachments } = buildCommContent(demandNoticeText({ buyerName: buyer.fullName, unitNumber: sale.unit.unitNumber, description: s.description, balance, dueDate: s.dueDate }), [letter])
            for (const [channel, address] of [['EMAIL', buyer.email], ['WHATSAPP', buyer.whatsappNumber]] as const) {
              if (address) logs.push({ saleId: sale.id, buyerId: buyer.id, channel, type: 'DEMAND_LETTER', messageContent, attachments, status: 'PENDING' })
            }
          }
        }
        if (logs.length > 0) await tx.communicationLog.createMany({ data: logs })
        letters = logs.length
      }

      await tx.auditLog.create({
        data: { userId: actorId, projectId: sale.projectId, entityType: 'sale', entityId: sale.id, action: enabled ? 'communication_on' : 'communication_off', oldValues: { commsEnabled: sale.commsEnabled }, newValues: { commsEnabled: enabled, demandLetters: letters } },
      })
    }
    return { enabled, letters }
  }, { timeout: 30_000, maxWait: 10_000 })
}
