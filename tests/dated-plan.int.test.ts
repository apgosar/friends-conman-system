import { it, expect, beforeEach, vi } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'

vi.mock('@/lib/comms-dispatcher', () => ({ dispatchAllPending: async () => undefined }))

const day = (d: string) => new Date(`${d}T09:00:00.000Z`)

describeDb('a date-based payment plan', () => {
  beforeEach(async () => { await resetDb() })

  async function seed(over: { commsEnabled?: boolean } = {}) {
    const prisma = await getPrisma()
    await seedUser('ADMIN')
    const { project, units } = await seedProject({ units: 1 })
    await prisma.project.update({ where: { id: project.id }, data: { demandDueDays: 10 } })
    const sale = await prisma.sale.create({ data: { saleNumber: 'S-1', projectId: project.id, unitId: units[0].id, agreementValue: 1_000_000, gstAmount: 50_000, bookingDate: day('2026-01-01'), status: 'BOOKED', commsEnabled: over.commsEnabled ?? true } })
    await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Asha Rao', email: 'asha@example.com', whatsappNumber: '9876543210', isPrimary: true, sequence: 1, receiveComms: true } })
    const rows = await Promise.all([['First', '2026-09-01'], ['Second', '2027-09-01']].map(([description, on]) =>
      prisma.paymentSchedule.create({ data: { saleId: sale.id, description, principalAmount: 400_000, gstAmount: 20_000, status: 'UPCOMING', autoRaise: true, raiseOn: day(on) } })))
    const manual = await prisma.paymentSchedule.create({ data: { saleId: sale.id, description: 'Stamp duty and registration', principalAmount: 60_000, gstAmount: 0, status: 'UPCOMING' } })
    return { prisma, sale, rows, manual }
  }

  it('raises a demand on its date, due the project days later, and leaves the other rows alone', async () => {
    const { prisma, rows, manual } = await seed()
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    const result = await runDailyInterestAndStatus(day('2026-09-01'))
    expect(result.dated).toEqual({ raised: 1, messages: 2 }) // one buyer, email and WhatsApp
    const first = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: rows[0].id } })
    expect(first.status).toBe('DUE')
    expect(first.demandGeneratedDate).not.toBeNull()
    expect(Math.round((first.dueDate!.getTime() - day('2026-09-01').getTime()) / 86_400_000)).toBe(10)
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: rows[1].id } })).status).toBe('UPCOMING')
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: manual.id } })).status).toBe('UPCOMING')
    const logs = await prisma.communicationLog.findMany({ where: { type: 'DEMAND_LETTER' } })
    expect(logs).toHaveLength(2)
    expect(logs[0].messageContent).toContain("Payment for 'First' is now due")
    expect(JSON.stringify(logs[0].attachments)).toContain('milestoneName=First')
  })

  it('never raises the same demand twice', async () => {
    const { prisma } = await seed()
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    await runDailyInterestAndStatus(day('2026-09-01'))
    const again = await runDailyInterestAndStatus(day('2026-09-02'))
    expect(again.dated).toEqual({ raised: 0, messages: 0 })
    expect(await prisma.communicationLog.count({ where: { type: 'DEMAND_LETTER' } })).toBe(2)
  })

  it('catches up a missed day, and raises both when both dates have passed', async () => {
    const { prisma } = await seed()
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    const result = await runDailyInterestAndStatus(day('2027-10-01'))
    expect(result.dated.raised).toBe(2)
    expect(await prisma.paymentSchedule.count({ where: { autoRaise: true, demandGeneratedDate: { not: null } } })).toBe(2)
  })

  it('is raised for a sale with communication off, and its letters are held, not sent', async () => {
    const { prisma, rows } = await seed({ commsEnabled: false })
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    await runDailyInterestAndStatus(day('2026-09-01'))
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: rows[0].id } })).status).toBe('DUE')
    const logs = await prisma.communicationLog.findMany({ where: { type: 'DEMAND_LETTER' } })
    expect(logs.every((l) => l.status === 'PENDING')).toBe(true) // the dispatcher holds them (see sale-comms)
  })

  it('a possession instalment follows its milestone, not the daily job, while the dated ones follow their date', async () => {
    const { prisma, sale, rows } = await seed()
    const milestone = await prisma.constructionMilestone.create({ data: { projectId: sale.projectId, name: 'On Possession', sequence: 9 } })
    const possession = await prisma.paymentSchedule.create({ data: { saleId: sale.id, milestoneId: milestone.id, description: 'On Possession', principalAmount: 200_000, gstAmount: 10_000, status: 'UPCOMING' } })
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    const { raiseDemands } = await import('@/lib/demand-raising')
    await runDailyInterestAndStatus(day('2027-10-01')) // both dates have passed
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: possession.id } })).status).toBe('UPCOMING')
    expect(await prisma.paymentSchedule.count({ where: { id: { in: rows.map((r) => r.id) }, status: 'DUE' } })).toBe(2)
    const done = await raiseDemands({ milestoneId: milestone.id }, { raisedOn: day('2028-01-01'), dueDateFor: () => day('2028-01-11'), compose: (s) => ({ text: s.description, extra: [], letterFor: 'On Possession' }) })
    expect(done.raised).toBe(1)
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: possession.id } })).status).toBe('DUE')
  })

  it('does not raise the demands of a cancelled sale', async () => {
    const { prisma, sale, rows } = await seed()
    await prisma.sale.update({ where: { id: sale.id }, data: { status: 'CANCELLED' } })
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    const result = await runDailyInterestAndStatus(day('2027-10-01'))
    expect(result.dated.raised).toBe(0)
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: rows[0].id } })).status).toBe('UPCOMING')
  })
})
