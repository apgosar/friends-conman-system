import { it, expect, beforeEach, vi } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject } from './helpers/db'

const deleteFile = vi.fn<(key: string) => Promise<void>>(async () => undefined)
vi.mock('@/lib/storage', () => ({ deleteFile: (key: string) => deleteFile(key), uploadFile: vi.fn(), downloadFile: vi.fn(), getPresignedUrl: vi.fn() }))

async function seedBuyer() {
  const prisma = await getPrisma()
  const { project, units } = await seedProject({ units: 1 })
  const sale = await prisma.sale.create({ data: { saleNumber: 'E-1', projectId: project.id, unitId: units[0].id, agreementValue: 100, gstAmount: 5, bookingDate: new Date() } })
  const buyer = await prisma.buyer.create({
    data: { saleId: sale.id, fullName: 'Asha Rao', email: 'asha@example.com', whatsappNumber: '9876543210', panNumber: 'ABCDE1234F', aadhaarNumber: '123412341234', address: '12 Hill Road', isPrimary: true },
  })
  await prisma.kycDocument.createMany({ data: [
    { buyerId: buyer.id, docType: 'PAN', fileUrl: '/api/files/kyc%2Fpan.png' },
    { buyerId: buyer.id, docType: 'AADHAAR', fileUrl: '/api/files/kyc%2Faadhaar.png' },
  ] })
  await prisma.communicationLog.create({ data: { saleId: sale.id, buyerId: buyer.id, channel: 'EMAIL', type: 'RECEIPT', messageContent: 'Dear Asha Rao, receipt', attachments: [{ label: 'Receipt', path: '/api/x' }], status: 'SENT' } })
  await prisma.auditLog.create({ data: { entityType: 'BUYER', entityId: buyer.id, action: 'AUTO_UPDATE', newValues: { fullName: 'Asha Rao', email: 'asha@example.com' } } })
  const admin = await prisma.user.create({ data: { name: 'Root', email: 'root@example.com', password: 'x', role: 'SUPER_ADMIN' } })
  return { prisma, buyer, sale, admin }
}

describeDb('erasure of personal data (DPDP)', () => {
  beforeEach(async () => { await resetDb(); deleteFile.mockClear() })

  it('removes the person but keeps the sale', async () => {
    const { prisma, buyer, sale, admin } = await seedBuyer()
    const { anonymizeBuyer } = await import('@/lib/dpdp-compliance')
    const result = await anonymizeBuyer(buyer.id, admin.id, 'Customer request')
    expect(result).toMatchObject({ success: true, kycDocumentsDeleted: 2, filesNotDeleted: 0 })

    const after = await prisma.buyer.findUniqueOrThrow({ where: { id: buyer.id } })
    expect(after.fullName).toMatch(/^ANONYMIZED_[0-9a-f]{12}$/)
    expect([after.email, after.whatsappNumber, after.panNumber, after.aadhaarNumber]).toEqual([null, null, null, null])
    expect(after.address).toBe('ANONYMIZED')
    expect(after.receiveComms).toBe(false)
    expect(await prisma.sale.findUnique({ where: { id: sale.id } })).not.toBeNull()

    expect(await prisma.kycDocument.count({ where: { buyerId: buyer.id } })).toBe(0)
    expect(deleteFile.mock.calls.map((c) => c[0]).sort()).toEqual(['kyc/aadhaar.png', 'kyc/pan.png'])

    const log = await prisma.communicationLog.findFirstOrThrow({ where: { buyerId: buyer.id } })
    expect(log.messageContent).not.toContain('Asha')
    expect(log.attachments).toBeNull()
  })

  it('strips the personal values from earlier audit entries and records the erasure itself', async () => {
    const { prisma, buyer, admin } = await seedBuyer()
    const { anonymizeBuyer } = await import('@/lib/dpdp-compliance')
    await anonymizeBuyer(buyer.id, admin.id, 'Customer request')

    const rows = await prisma.auditLog.findMany({ where: { entityType: 'BUYER', entityId: buyer.id } })
    expect(JSON.stringify(rows.map((r) => [r.oldValues, r.newValues]))).not.toMatch(/Asha|asha@example/)
    const erasure = rows.find((r) => r.action === 'ANONYMIZE_PII')
    expect(erasure?.userId).toBe(admin.id)
    expect(erasure?.newValues).toMatchObject({ reason: 'Customer request', kycDocumentsDeleted: 2 })
  })

  it('reports a stored file it could not delete instead of failing half way', async () => {
    const { buyer, admin, prisma } = await seedBuyer()
    deleteFile.mockRejectedValueOnce(new Error('storage down'))
    const { anonymizeBuyer } = await import('@/lib/dpdp-compliance')
    expect(await anonymizeBuyer(buyer.id, admin.id)).toMatchObject({ kycDocumentsDeleted: 2, filesNotDeleted: 1 })
    expect((await prisma.buyer.findUniqueOrThrow({ where: { id: buyer.id } })).fullName).toMatch(/^ANONYMIZED_/)
  })

  it('refuses to erase twice, and an unknown buyer', async () => {
    const { buyer, admin } = await seedBuyer()
    const { anonymizeBuyer } = await import('@/lib/dpdp-compliance')
    await anonymizeBuyer(buyer.id, admin.id)
    await expect(anonymizeBuyer(buyer.id, admin.id)).rejects.toMatchObject({ kind: 'conflict' })
    await expect(anonymizeBuyer('nope', admin.id)).rejects.toMatchObject({ kind: 'notFound' })
  })
})
