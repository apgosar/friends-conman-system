import { it, expect, beforeEach } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject } from './helpers/db'

async function seedSale() {
  const prisma = await getPrisma()
  const { project, units } = await seedProject({ units: 1 })
  return prisma.sale.create({ data: { saleNumber: `P-${Math.random().toString(36).slice(2, 7)}`, projectId: project.id, unitId: units[0].id, agreementValue: 1, gstAmount: 0, bookingDate: new Date() } })
}
const raw = async (id: string) => ((await (await getPrisma()).$queryRaw<{ panNumber: string | null; aadhaarNumber: string | null }[]>`SELECT "panNumber", "aadhaarNumber" FROM buyers WHERE id = ${id}`)[0])

describeDb('PAN and Aadhaar at rest', () => {
  beforeEach(resetDb)

  it('encrypts on create, createMany and update, and the database never holds the number', async () => {
    const prisma = await getPrisma()
    const sale = await seedSale()
    const one = await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Asha', panNumber: 'ABCDE1234F', aadhaarNumber: '123412341234', isPrimary: true } })
    await prisma.buyer.createMany({ data: [{ saleId: sale.id, fullName: 'Ravi', panNumber: 'PQRST5678U', sequence: 2 }] })
    const two = await prisma.buyer.findFirstOrThrow({ where: { fullName: 'Ravi' } })

    for (const id of [one.id, two.id]) {
      const row = await raw(id)
      expect(row.panNumber).toMatch(/^enc:v1:/)
      expect(row.panNumber).not.toContain('ABCDE')
    }
    expect((await raw(one.id)).aadhaarNumber).toMatch(/^enc:v1:/)

    await prisma.buyer.update({ where: { id: one.id }, data: { panNumber: 'ZZZZZ9999Z' } })
    const updated = await raw(one.id)
    expect(updated.panNumber).toMatch(/^enc:v1:/)
    const { revealPii } = await import('@/lib/pii')
    expect(revealPii(updated.panNumber)).toBe('ZZZZZ9999Z')
  })

  it('leaves missing numbers empty', async () => {
    const prisma = await getPrisma()
    const sale = await seedSale()
    const b = await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'No ID', isPrimary: true } })
    expect(await raw(b.id)).toEqual({ panNumber: null, aadhaarNumber: null })
  })

  it('converts numbers stored as plain text, once, and leaves protected ones alone', async () => {
    const prisma = await getPrisma()
    const sale = await seedSale()
    const old = await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Old', isPrimary: true } })
    const fresh = await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Fresh', panNumber: 'FRESH1234F', sequence: 2 } })
    await prisma.$executeRaw`UPDATE buyers SET "panNumber" = 'OLDPA1234P', "aadhaarNumber" = '999988887777' WHERE id = ${old.id}`
    const before = (await raw(fresh.id)).panNumber

    const { encryptExistingPii } = await import('@/lib/pii-migration')
    const { PrismaClient } = await import('@prisma/client')
    const plain = new PrismaClient()
    try {
      expect(await encryptExistingPii(plain)).toEqual({ scanned: 2, converted: 1 })
      expect(await encryptExistingPii(plain)).toEqual({ scanned: 2, converted: 0 }) // second run changes nothing
    } finally {
      await plain.$disconnect()
    }
    const { revealPii } = await import('@/lib/pii')
    const converted = await raw(old.id)
    expect(converted.panNumber).toMatch(/^enc:v1:/)
    expect(revealPii(converted.panNumber)).toBe('OLDPA1234P')
    expect(revealPii(converted.aadhaarNumber)).toBe('999988887777')
    expect((await raw(fresh.id)).panNumber).toBe(before)
  })
})
