import { describe, it, expect, beforeEach } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'
import { sessionContext } from '@/lib/async-context'
import { redact } from '@/lib/redact'

describe('redact', () => {
  it('masks identity numbers and removes secrets, recursively', () => {
    const out = redact({ fullName: 'A', panNumber: 'ABCDE1234F', aadhaarNumber: '1234 5678 9012', password: 'hunter2', nested: [{ token: 'x', ok: 1 }] }) as any
    expect(out.panNumber).toBe('******234F')
    expect(out.aadhaarNumber).toBe('********9012')
    expect(out.password).toBe('[redacted]')
    expect(out.nested[0]).toEqual({ token: '[redacted]', ok: 1 })
    expect(out.fullName).toBe('A')
  })
})

describeDb('automatic audit trail', () => {
  beforeEach(resetDb)

  it('records the acting user for audited models (used to fail on a foreign key and be swallowed)', async () => {
    const prisma = await getPrisma()
    const user = await seedUser('ADMIN')
    const { project, units } = await seedProject({ units: 1 })
    await sessionContext.run({ userId: user.id, email: user.email, role: 'ADMIN' }, async () => {
      await prisma.sale.create({ data: { saleNumber: 'A-001', projectId: project.id, unitId: units[0].id, agreementValue: 100, gstAmount: 5, bookingDate: new Date() } })
    })
    const rows = await prisma.auditLog.findMany({ where: { entityType: 'SALE', action: 'AUTO_CREATE' } })
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(user.id)
  })

  it('writes the entry with no user (not a failed insert) when there is no request', async () => {
    const prisma = await getPrisma()
    const { project, units } = await seedProject({ units: 1 })
    await prisma.sale.create({ data: { saleNumber: 'A-002', projectId: project.id, unitId: units[0].id, agreementValue: 100, gstAmount: 5, bookingDate: new Date() } })
    const rows = await prisma.auditLog.findMany({ where: { entityType: 'SALE' } })
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBeNull()
  })

  it('never stores raw PAN / Aadhaar in the audit trail', async () => {
    const prisma = await getPrisma()
    const { project, units } = await seedProject({ units: 1 })
    const sale = await prisma.sale.create({ data: { saleNumber: 'A-003', projectId: project.id, unitId: units[0].id, agreementValue: 100, gstAmount: 5, bookingDate: new Date() } })
    await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Asha', panNumber: 'ABCDE1234F', aadhaarNumber: '123456789012' } })
    const rows = await prisma.auditLog.findMany({ where: { entityType: 'BUYER' } })
    expect(JSON.stringify(rows[0].newValues)).not.toContain('ABCDE1234F')
    expect(JSON.stringify(rows[0].newValues)).not.toContain('123456789012')
  })
})
