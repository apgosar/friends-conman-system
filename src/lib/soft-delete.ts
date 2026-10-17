/**
 * Soft-delete helpers for financial entities.
 *
 * Financial records (sales, payments, documents) must NEVER be hard-deleted.
 * These helpers set `deletedAt` instead of calling `prisma.model.delete()`.
 *
 * Usage:
 *   // Instead of: await prisma.document.delete({ where: { id } })
 *   // Use:        await softDelete.document(id)
 *
 * To filter out deleted records in queries, always add:
 *   where: { deletedAt: null }
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'

interface SoftDeleteOptions {
  userId: string
  reason?: string
}

export const softDelete = {
  /**
   * Soft-delete a Sale. Sets deletedAt on the sale record.
   * Does NOT cascade to child records — they remain queryable for audit.
   */
  async sale(id: string, opts: SoftDeleteOptions) {
    const sale = await prisma.sale.findUnique({
      where: { id },
      select: { saleNumber: true, unitId: true, status: true, deletedAt: true },
    })

    if (!sale) throw new Error('Sale not found')
    if (sale.deletedAt) throw new Error('Sale is already deleted')

    await prisma.$transaction(async (tx) => {
      // Mark the sale as soft-deleted
      await tx.sale.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'CANCELLED' },
      })

      // The inquiry this sale was converted from is open again, so it can be re-converted
      await tx.inquiry.updateMany({
        where: { convertedSaleId: id, status: 'CONVERTED' },
        data: { status: 'OPEN', convertedSaleId: null },
      })

      // Release the unit: back to Inquiry Received if it still has open inquiries, otherwise Available
      if (sale.unitId) {
        const openInquiries = await tx.inquiry.count({ where: { unitId: sale.unitId, status: 'OPEN' } })
        await tx.unit.update({
          where: { id: sale.unitId },
          data: { status: openInquiries > 0 ? 'INQUIRY_RECEIVED' : 'AVAILABLE', statusManual: false, bookedByName: null, bookedByMobile: null },
        })
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: opts.userId,
          entityType: 'sale',
          entityId: id,
          action: 'soft_deleted',
          oldValues: { status: sale.status, saleNumber: sale.saleNumber },
          newValues: { deletedAt: new Date().toISOString(), reason: opts.reason ?? 'manual' },
        },
      })
    })
  },

  /**
   * Soft-delete a Payment. Sets deletedAt; does NOT reverse schedule status.
   * Schedule status reversal must be done explicitly by a SUPER_ADMIN.
   */
  async payment(id: string, opts: SoftDeleteOptions) {
    const payment = await prisma.payment.findUnique({
      where: { id },
      select: { receiptNumber: true, amount: true, deletedAt: true },
    })

    if (!payment) throw new Error('Payment not found')
    if (payment.deletedAt) throw new Error('Payment is already deleted')

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id },
        data: { deletedAt: new Date() },
      })

      await tx.auditLog.create({
        data: {
          userId: opts.userId,
          entityType: 'payment',
          entityId: id,
          action: 'soft_deleted',
          oldValues: { receiptNumber: payment.receiptNumber, amount: payment.amount },
          newValues: { deletedAt: new Date().toISOString(), reason: opts.reason ?? 'manual' },
        },
      })
    })
  },

  /**
   * Soft-delete a Document. Sets deletedAt.
   */
  async document(id: string, opts: SoftDeleteOptions) {
    const doc = await prisma.document.findUnique({
      where: { id },
      select: { type: true, status: true, deletedAt: true },
    })

    if (!doc) throw new Error('Document not found')
    if (doc.deletedAt) throw new Error('Document is already deleted')

    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id },
        data: { deletedAt: new Date() },
      })

      await tx.auditLog.create({
        data: {
          userId: opts.userId,
          entityType: 'document',
          entityId: id,
          action: 'soft_deleted',
          oldValues: { type: doc.type, status: doc.status },
          newValues: { deletedAt: new Date().toISOString(), reason: opts.reason ?? 'manual' },
        },
      })
    })
  },
}

/**
 * Standard Prisma where-clause addition to exclude soft-deleted records.
 * Use in findMany, findUnique, count, etc.
 *
 * Example:
 *   await prisma.sale.findMany({ where: { ...notDeleted, projectId } })
 */
export const notDeleted = { deletedAt: null } as const

/**
 * A sale that counts: not soft-deleted and not cancelled. Use it (as `sale: activeSale`, or spread into a Sale query)
 * for everything that adds up money or inventory, so cancelled bookings never show as revenue, receivables or a locked unit.
 */
export const activeSale = { deletedAt: null, status: { not: 'CANCELLED' } } as const
