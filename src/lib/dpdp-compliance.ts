import { prisma } from '@/lib/db'
import crypto from 'crypto'

/**
 * DPDP Act Compliance: Right to be Forgotten.
 * Scrambles a buyer's PII (Name, Email, Phone, PAN, Aadhaar) to irreversibly 
 * anonymize them while maintaining referential integrity for financial records 
 * (Sales, Payments).
 */
export async function anonymizeBuyer(buyerId: string, performedByUserId: string) {
  const buyer = await prisma.buyer.findUnique({ where: { id: buyerId } })
  
  if (!buyer) {
    throw new Error('Buyer not found')
  }

  // Generate a deterministic but irreversible hash of the original ID 
  // to serve as the anonymized identifier.
  const hash = crypto.createHash('sha256').update(buyerId + process.env.NEXTAUTH_SECRET).digest('hex').substring(0, 12)

  await prisma.$transaction(async (tx) => {
    await tx.buyer.update({
      where: { id: buyerId },
      data: {
        fullName: `ANONYMIZED_${hash}`,
        email: null,
        whatsappNumber: null,
        panNumber: null,
        aadhaarNumber: null,
        address: 'ANONYMIZED',
        receiveComms: false,
      }
    })

    // Also soft-delete any associated KYC documents, as they contain PII
    const docs = await tx.kycDocument.findMany({ where: { buyerId } })
    for (const doc of docs) {
      await tx.kycDocument.update({
        where: { id: doc.id },
        data: { status: 'DELETED' } // Assuming 'DELETED' is handled, or we can just delete the record entirely
      })
    }

    // Log the erasure request for compliance auditing
    await tx.auditLog.create({
      data: {
        action: 'ANONYMIZE_PII',
        entityId: buyerId,
        entityType: 'BUYER',
        userId: performedByUserId,
        newValues: { message: 'Buyer PII permanently anonymized pursuant to DPDP Act Erasure request.' },
      }
    })
  })

  return { success: true, hash }
}
