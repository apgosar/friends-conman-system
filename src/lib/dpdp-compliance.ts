import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { deleteFile } from '@/lib/storage'
import { keyFromFileUrl } from '@/lib/storage/files'
import { fail } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * DPDP Act: erasure of a buyer's personal data on request. The sale, its payments and its documents stay (the books
 * must balance and RERA records are kept); the person in them stops being identifiable:
 *   - name, e-mail, phone, address, PAN and Aadhaar on the buyer record are replaced or cleared
 *   - their KYC documents are deleted, including the stored files
 *   - the text of messages sent to them is removed
 *   - earlier audit entries about the buyer lose the values they recorded
 * Documents already generated for the sale (agreements, receipts) still carry the name; they are legal records.
 */
export const ANONYMIZED_PREFIX = 'ANONYMIZED_'
export const isAnonymized = (fullName: string) => fullName.startsWith(ANONYMIZED_PREFIX)

export async function anonymizeBuyer(buyerId: string, performedByUserId: string, reason?: string) {
  const buyer = await prisma.buyer.findUnique({ where: { id: buyerId }, select: { id: true, fullName: true } })
  if (!buyer) throw fail('notFound', 'Buyer not found')
  if (isAnonymized(buyer.fullName)) throw fail('conflict', 'This buyer’s personal data has already been erased')

  // A short code that identifies the record on screen without identifying the person
  const code = crypto.createHash('sha256').update(buyerId + (process.env.NEXTAUTH_SECRET ?? '')).digest('hex').substring(0, 12)

  const kycFileUrls = await prisma.$transaction(async (tx) => {
    await tx.buyer.update({
      where: { id: buyerId },
      data: { fullName: `${ANONYMIZED_PREFIX}${code}`, email: null, whatsappNumber: null, panNumber: null, aadhaarNumber: null, address: 'ANONYMIZED', receiveComms: false },
    })

    const docs = await tx.kycDocument.findMany({ where: { buyerId }, select: { id: true, fileUrl: true } })
    await tx.kycDocument.deleteMany({ where: { buyerId } })

    await tx.communicationLog.updateMany({ where: { buyerId }, data: { messageContent: '[removed: personal data erased]', attachments: Prisma.DbNull } })

    // The audit trail keeps that something happened, not the personal values it recorded
    await tx.auditLog.updateMany({
      where: { entityType: { in: ['BUYER', 'buyer'] }, entityId: buyerId },
      data: { oldValues: { erased: true }, newValues: { erased: true } },
    })
    await tx.auditLog.create({
      data: {
        action: 'ANONYMIZE_PII',
        entityId: buyerId,
        entityType: 'BUYER',
        userId: performedByUserId,
        newValues: { message: 'Personal data erased on request (DPDP Act)', reason: reason ?? null, kycDocumentsDeleted: docs.length },
      },
    })
    return docs.map((d) => d.fileUrl)
  })

  // Files go after the database change has committed: a failure here leaves a file to clean up, never a half-erased record
  let filesNotDeleted = 0
  for (const url of kycFileUrls) {
    const key = keyFromFileUrl(url)
    if (!key) { filesNotDeleted++; continue }
    try { await deleteFile(key) } catch (err) {
      filesNotDeleted++
      logger.error({ err, buyerId, key }, 'Could not delete a KYC file during erasure; remove it by hand')
    }
  }
  return { success: true, code, kycDocumentsDeleted: kycFileUrls.length, filesNotDeleted }
}
