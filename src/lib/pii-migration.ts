import type { PrismaClient } from '@prisma/client'
import { encryptPii, isEncryptedPii } from '@/lib/pii'

/**
 * Encrypts PAN / Aadhaar numbers still stored as plain text. Safe to repeat: protected numbers are skipped.
 * Takes a plain PrismaClient on purpose: the app's client would re-encrypt on write and audit every row.
 */
export async function encryptExistingPii(prisma: PrismaClient): Promise<{ scanned: number; converted: number }> {
  let scanned = 0
  let converted = 0
  let cursor: string | undefined
  for (;;) {
    const rows = await prisma.buyer.findMany({
      where: { OR: [{ panNumber: { not: null } }, { aadhaarNumber: { not: null } }] },
      select: { id: true, panNumber: true, aadhaarNumber: true },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })
    if (rows.length === 0) break
    for (const row of rows) {
      scanned++
      const data: { panNumber?: string; aadhaarNumber?: string } = {}
      if (row.panNumber && !isEncryptedPii(row.panNumber)) data.panNumber = encryptPii(row.panNumber)
      if (row.aadhaarNumber && !isEncryptedPii(row.aadhaarNumber)) data.aadhaarNumber = encryptPii(row.aadhaarNumber)
      if (Object.keys(data).length > 0) {
        await prisma.buyer.update({ where: { id: row.id }, data })
        converted++
      }
    }
    cursor = rows[rows.length - 1].id
  }
  return { scanned, converted }
}
