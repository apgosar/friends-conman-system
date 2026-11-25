import { it, expect, beforeEach, vi } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'
import { SaleCreateSchema } from '@/lib/sales/create-sale'
import { SaleEditSchema } from '@/lib/sales/edit-sale'

vi.mock('@/lib/comms-dispatcher', async (orig) => ({ ...(await orig<typeof import('@/lib/comms-dispatcher')>()), dispatchAllPending: async () => [] }))

const buyer = (over: Record<string, unknown> = {}) => ({ fullName: 'Asha Rao', email: 'asha@example.com', whatsappNumber: '9876543210', panNumber: 'ABCDE1234F', aadhaarNumber: '', address: '12 MG Road, Pune', ...over })
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

describeDb('a date-based plan made today', () => {
  beforeEach(resetDb)

  async function create(dates: string[]) {
    const prisma = await getPrisma()
    const actorId = (await seedUser('ADMIN')).id
    const { project, units } = await seedProject({ units: 1 })
    await prisma.project.update({ where: { id: project.id }, data: { demandDueDays: 10 } })
    const { createSale } = await import('@/lib/sales/create-sale')
    const each = 1_000_000 / dates.length
    const sale = await createSale(SaleCreateSchema.parse({
      projectId: project.id, unitId: units[0].id, agreementValue: 1_000_000, gstAmount: 50_000, bookingDate: day(0), buyers: [buyer()],
      paymentSchedules: dates.map((d, i) => ({ description: `Instalment ${i + 1}`, principalAmount: each, gstAmount: each * 0.05, autoRaise: true, raiseOn: d })),
    }), actorId)
    const rows = await prisma.paymentSchedule.findMany({ where: { saleId: sale.id }, orderBy: { createdAt: 'asc' } })
    return { prisma, actorId, units, sale, rows }
  }

  it('raises an instalment whose date is past or today at once, and leaves a future one upcoming', async () => {
    const s = await create([day(-30), day(0), day(60)])
    const after = await s.prisma.paymentSchedule.findMany({ where: { saleId: s.sale.id } })
    const by = (d: string) => after.find((r) => r.description === d)!
    expect(by('Instalment 1').status).toBe('DUE')
    expect(by('Instalment 2').status).toBe('DUE')
    expect(by('Instalment 3').status).toBe('UPCOMING')
    expect(by('Instalment 3').demandGeneratedDate).toBeNull()
    expect(Math.round((by('Instalment 1').dueDate!.getTime() - Date.now()) / 86_400_000)).toBe(10) // due the project's days from today, not from the old date
    expect(await s.prisma.communicationLog.count({ where: { saleId: s.sale.id, type: 'DEMAND_LETTER' } })).toBe(4) // two demands x email and WhatsApp
  })

  it('does not raise them again on the next daily run', async () => {
    const s = await create([day(-30), day(60)])
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    expect((await runDailyInterestAndStatus(new Date())).dated.raised).toBe(0)
    expect(await s.prisma.communicationLog.count({ where: { saleId: s.sale.id, type: 'DEMAND_LETTER' } })).toBe(2)
  })

  it('raises an instalment at once when it is moved to a past date by editing the sale', async () => {
    const s = await create([day(30), day(60)])
    const { updateSale } = await import('@/lib/sales/edit-sale')
    const buyers = await s.prisma.buyer.findMany({ where: { saleId: s.sale.id } })
    const out = await updateSale(s.sale.id, SaleEditSchema.parse({
      unitId: s.units[0].id, agreementValue: 1_000_000, gstAmount: 50_000, bookingDate: day(0), reason: 'Date corrected',
      buyers: [buyer({ id: buyers[0].id, panNumber: '' })],
      paymentSchedules: s.rows.map((r) => ({ id: r.id, description: r.description, principalAmount: Number(r.principalAmount), gstAmount: Number(r.gstAmount), autoRaise: true, raiseOn: r.description === 'Instalment 1' ? day(-5) : day(60) })),
    }), s.actorId)
    expect(out.datedRaised).toBe(1)
    const rows = await s.prisma.paymentSchedule.findMany({ where: { saleId: s.sale.id } })
    expect(rows.find((r) => r.description === 'Instalment 1')!.status).toBe('DUE')
    expect(rows.find((r) => r.description === 'Instalment 2')!.status).toBe('UPCOMING')
    expect(out.letters).toBeGreaterThan(0)
  })
})
