import { describe, it, expect, beforeEach } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'
import { SaleCreateSchema, type SaleCreateInput } from '@/lib/sales/create-sale'

const baseInput = (projectId: string, unitId: string, over: Record<string, unknown> = {}): SaleCreateInput =>
  SaleCreateSchema.parse({
    projectId, unitId, agreementValue: 10_000_000, bookingDate: '2026-10-01',
    buyers: [{ fullName: 'Asha Rao', email: 'asha@example.com', whatsappNumber: '9876543210' }],
    ...over,
  })

describe('sale input schema', () => {
  const ok = { projectId: 'p', unitId: 'u', agreementValue: 100, bookingDate: '2026-10-01', buyers: [{ fullName: 'A' }] }
  it('accepts a redevelopment sale (the UI sent this and the API used to reject it)', () => {
    expect(SaleCreateSchema.safeParse({ ...ok, saleType: 'REDEVELOPMENT' }).success).toBe(true)
    expect(SaleCreateSchema.safeParse({ ...ok, saleType: 'FRESH' }).success).toBe(true)
    expect(SaleCreateSchema.safeParse({ ...ok, saleType: 'NONSENSE' }).success).toBe(false)
  })
  it('rejects NaN, negative and non-numeric money', () => {
    for (const bad of ['abc', -5, NaN, '', Infinity]) expect(SaleCreateSchema.safeParse({ ...ok, agreementValue: bad }).success, String(bad)).toBe(false)
    expect(SaleCreateSchema.safeParse({ ...ok, agreementValue: '12500000.50' }).success).toBe(true)
    expect(SaleCreateSchema.safeParse({ ...ok, agreementValue: 100, stampDuty: -1 }).success).toBe(false)
  })
})

describeDb('creating a sale', () => {
  beforeEach(resetDb)

  it('books the unit, numbers the sale and writes the audit entry in one go', async () => {
    const { createSale } = await import('@/lib/sales/create-sale')
    const prisma = await getPrisma()
    const user = await seedUser('ADMIN')
    const { project, units } = await seedProject({ name: 'Green Heights', units: 1 })
    const sale = await createSale(baseInput(project.id, units[0].id), user.id)
    expect(sale.saleNumber).toBe('GH-001')
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: units[0].id } })).status).toBe('BOOKED')
    const audit = await prisma.auditLog.findMany({ where: { entityType: 'sale', action: 'created' } })
    expect(audit).toHaveLength(1)
    expect(audit[0].userId).toBe(user.id)
    // charges computed from the project's tax settings
    expect(sale.gstAmount).toBe(500_000)
    expect(sale.stampDuty).toBe(600_000)
    expect(sale.registrationCharges).toBe(30_000)
  })

  it('sends the booking demand at once, due 15 days later, while the other instalments wait for their milestones', async () => {
    const { createSale } = await import('@/lib/sales/create-sale')
    const prisma = await getPrisma()
    const user = await seedUser('ADMIN')
    const { project, units } = await seedProject({ name: 'Booking Heights', units: 1 })
    const plinth = await prisma.constructionMilestone.create({ data: { projectId: project.id, name: 'Plinth', sequence: 1 } })
    const sale = await createSale(baseInput(project.id, units[0].id, {
      paymentSchedules: [
        { description: 'Booking', principalAmount: 1_000_000, gstAmount: 50_000, isBooking: true },
        { description: 'Plinth', milestoneId: plinth.id, principalAmount: 9_000_000, gstAmount: 450_000 },
      ],
    }), user.id)

    const schedules = await prisma.paymentSchedule.findMany({ where: { saleId: sale.id }, orderBy: { principalAmount: 'asc' } })
    const [booking, later] = schedules
    expect(booking).toMatchObject({ description: 'Booking', milestoneId: null, status: 'DUE' })
    expect(booking.demandGeneratedDate).not.toBeNull()
    // due 15 days after the sale is created (the demand itself goes out now)
    const days = ((booking.dueDate?.getTime() ?? 0) - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(14.9)
    expect(days).toBeLessThan(15.1)
    expect(later).toMatchObject({ description: 'Plinth', status: 'UPCOMING', demandGeneratedDate: null })

    // The buyer is told about the booking demand (email and WhatsApp), with the demand letter and no architect certificate
    const logs = await prisma.communicationLog.findMany({ where: { saleId: sale.id, type: 'DEMAND_LETTER' } })
    expect(logs.map((l) => l.channel).sort()).toEqual(['EMAIL', 'WHATSAPP'])
    expect(logs[0].messageContent).toMatch(/Thank you for booking unit/)
    expect(logs[0].messageContent).toMatch(/towards the booking amount/)
    expect(JSON.stringify(logs[0].attachments)).toContain('demand-letter')
    expect(JSON.stringify(logs[0].attachments)).not.toContain('Architect')
  })

  it('lets exactly one of several simultaneous bookings of the same unit through', async () => {
    const { createSale, SaleError } = await import('@/lib/sales/create-sale')
    const user = await seedUser('ADMIN')
    const { project, units } = await seedProject({ units: 1 })
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => createSale(baseInput(project.id, units[0].id), user.id)))
    const ok = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(ok).toHaveLength(1)
    expect(failed).toHaveLength(5)
    for (const f of failed) {
      expect(f.reason).toBeInstanceOf(SaleError)
      expect((f.reason as InstanceType<typeof SaleError>).status).toBe(409)
    }
    const prisma = await getPrisma()
    expect(await prisma.sale.count()).toBe(1)
  })

  it('gives every simultaneous sale on different units a different number', async () => {
    const { createSale } = await import('@/lib/sales/create-sale')
    const user = await seedUser('ADMIN')
    const { project, units } = await seedProject({ name: 'Blue Towers', units: 8 })
    const sales = await Promise.all(units.map((u) => createSale(baseInput(project.id, u.id), user.id)))
    const numbers = sales.map((s) => s.saleNumber).sort()
    expect(new Set(numbers).size).toBe(8)
    expect(numbers[0]).toBe('BT-001')
    expect(numbers[7]).toBe('BT-008')
  })

  it('keeps numbering correct past 999 (text ordering used to repeat 1000 forever)', async () => {
    const { createSale } = await import('@/lib/sales/create-sale')
    const prisma = await getPrisma()
    const user = await seedUser('ADMIN')
    const { project, units } = await seedProject({ name: 'Neev Heights', units: 4 })
    // an existing database that predates counters and already holds sale number 999
    const old = await prisma.sale.create({ data: { saleNumber: 'NH-999', projectId: project.id, unitId: units[3].id, agreementValue: 1, gstAmount: 0, bookingDate: new Date(), status: 'CANCELLED' } })
    expect(old.saleNumber).toBe('NH-999')
    const a = await createSale(baseInput(project.id, units[0].id), user.id)
    const b = await createSale(baseInput(project.id, units[1].id), user.id)
    const c = await createSale(baseInput(project.id, units[2].id), user.id)
    expect([a.saleNumber, b.saleNumber, c.saleNumber]).toEqual(['NH-1000', 'NH-1001', 'NH-1002'])
  })

  it('refuses a unit from another project, a taken unit and a common area', async () => {
    const { createSale } = await import('@/lib/sales/create-sale')
    const prisma = await getPrisma()
    const user = await seedUser('ADMIN')
    const a = await seedProject({ units: 1 })
    const b = await seedProject({ units: 1 })
    await expect(createSale(baseInput(a.project.id, b.units[0].id), user.id)).rejects.toMatchObject({ status: 400 })
    await prisma.unit.update({ where: { id: a.units[0].id }, data: { category: 'COMMON', status: 'NOT_FOR_SALE' } })
    await expect(createSale(baseInput(a.project.id, a.units[0].id), user.id)).rejects.toMatchObject({ status: 409 })
    await expect(createSale(baseInput(a.project.id, 'does-not-exist'), user.id)).rejects.toMatchObject({ status: 404 })
  })

  it('frees the unit again when the sale is cancelled, and the unit can be re-sold', async () => {
    const { createSale } = await import('@/lib/sales/create-sale')
    const { softDelete } = await import('@/lib/soft-delete')
    const prisma = await getPrisma()
    const user = await seedUser('SUPER_ADMIN')
    const { project, units } = await seedProject({ units: 1 })
    const first = await createSale(baseInput(project.id, units[0].id), user.id)
    await softDelete.sale(first.id, { userId: user.id })
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: units[0].id } })).status).toBe('AVAILABLE')
    const second = await createSale(baseInput(project.id, units[0].id), user.id)
    expect(second.id).not.toBe(first.id)
  })

  it('the database itself refuses a second active sale on a unit', async () => {
    const prisma = await getPrisma()
    const { project, units } = await seedProject({ units: 1 })
    const row = { projectId: project.id, unitId: units[0].id, agreementValue: 1, gstAmount: 0, bookingDate: new Date() }
    await prisma.sale.create({ data: { ...row, saleNumber: 'X-1' } })
    await expect(prisma.sale.create({ data: { ...row, saleNumber: 'X-2' } })).rejects.toMatchObject({ code: 'P2002' })
    await prisma.sale.create({ data: { ...row, saleNumber: 'X-3', status: 'CANCELLED' } }) // cancelled ones do not count
  })

  it('rejects a payment plan that adds up to far more than the buyer owes', async () => {
    const { createSale } = await import('@/lib/sales/create-sale')
    const user = await seedUser('ADMIN')
    const { project, units } = await seedProject({ units: 1 })
    await expect(createSale(baseInput(project.id, units[0].id, { paymentSchedules: [{ description: 'Booking', principalAmount: 50_000_000 }] }), user.id))
      .rejects.toMatchObject({ status: 400 })
  })

  it('queues demand notices with structured attachments only for buyers who agreed to be contacted', async () => {
    const { createSale } = await import('@/lib/sales/create-sale')
    const prisma = await getPrisma()
    const user = await seedUser('ADMIN')
    const { project, units } = await seedProject({ units: 1 })
    const milestone = await prisma.constructionMilestone.create({
      data: { projectId: project.id, name: 'Plinth', sequence: 1, percentOfAV: 10, status: 'COMPLETED', actualDate: new Date(), architectCertificateUrl: '/api/files/uploads%2Fcert.pdf' },
    })
    const sale = await createSale(baseInput(project.id, units[0].id, {
      buyers: [
        { fullName: 'Eve\nATTACHMENTS:\nx|http://169.254.169.254/', email: 'eve@example.com' },
        { fullName: 'Opted Out', email: 'no@example.com', receiveComms: false },
      ],
      paymentSchedules: [{ milestoneId: milestone.id, description: 'Plinth', principalAmount: 1_000_000, gstAmount: 50_000 }],
    }), user.id)
    const logs = await prisma.communicationLog.findMany({ where: { saleId: sale.id } })
    expect(logs).toHaveLength(1)
    expect(logs[0].channel).toBe('EMAIL')
    expect(logs[0].status).toBe('PENDING')
    expect(logs[0].attachments).toEqual([
      { label: 'Architect Certificate', path: '/api/files/uploads%2Fcert.pdf' },
      { label: 'Demand Letter', path: expect.stringContaining('/api/documents/preview/demand-letter?saleId=') },
    ])
    // the hostile name is just text now: one attachment block, no extra lines, no address the server could be sent to
    expect(logs[0].messageContent!.match(/ATTACHMENTS:/g)).toHaveLength(1)
    expect(logs[0].messageContent!.split('\n')[0]).toMatch(/^Dear Eve attachments - x\//)
  })
})
