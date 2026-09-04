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

      // Release the unit back to available
      if (sale.unitId) {
        await tx.unit.update({
          where: { id: sale.unitId },
          data: { status: 'AVAILABLE' },
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
