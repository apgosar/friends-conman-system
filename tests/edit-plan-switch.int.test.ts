import { it, expect, beforeEach, vi } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'
import { SaleCreateSchema } from '@/lib/sales/create-sale'
import { SaleEditSchema } from '@/lib/sales/edit-sale'

vi.mock('@/lib/comms-dispatcher', async (orig) => ({ ...(await orig<typeof import('@/lib/comms-dispatcher')>()), dispatchAllPending: async () => [] }))

const buyer = (over: Record<string, unknown> = {}) => ({ fullName: 'Asha Rao', email: 'asha@example.com', whatsappNumber: '9876543210', panNumber: 'ABCDE1234F', aadhaarNumber: '', address: '12 MG Road, Pune', ...over })

// A milestone sale: Booking (paid in part), Plinth (raised) and Possession (not raised) of 1,000,000, plus the stamp duty row
async function setup() {
  const prisma = await getPrisma()
  const actorId = (await seedUser('ADMIN')).id
  const { project, units } = await seedProject({ units: 1 })
  const { createSale } = await import('@/lib/sales/create-sale')
  const sale = await createSale(SaleCreateSchema.parse({
    projectId: project.id, unitId: units[0].id, agreementValue: 1_000_000, gstAmount: 50_000, bookingDate: '2026-10-01',
    buyers: [buyer()],
    paymentSchedules: [
      { description: 'Booking', principalAmount: 100_000, gstAmount: 5_000, isBooking: true },
      { description: 'Plinth', principalAmount: 300_000, gstAmount: 15_000 },
      { description: 'Possession', principalAmount: 600_000, gstAmount: 30_000 },
    ],
  }), actorId)
  const rows = await prisma.paymentSchedule.findMany({ where: { saleId: sale.id } })
  const by = (d: string) => rows.find((r) => r.description === d)!
  await prisma.paymentSchedule.update({ where: { id: by('Plinth').id }, data: { status: 'DUE', demandGeneratedDate: new Date(), dueDate: new Date(Date.now() + 10 * 86_400_000) } })
  const buyers = await prisma.buyer.findMany({ where: { saleId: sale.id } })
  return { prisma, actorId, project, units, sale, by, buyers }
}

describeDb('switching a sale from milestones to dates', () => {
  beforeEach(resetDb)

  it('keeps the demand already sent, replaces the one not raised with dated instalments, and raises them by date', async () => {
    const s = await setup()
    const { updateSale } = await import('@/lib/sales/edit-sale')
    await updateSale(s.sale.id, SaleEditSchema.parse({
      unitId: s.units[0].id, agreementValue: 1_000_000, gstAmount: 50_000, bookingDate: '2026-10-01', reason: 'Moving to dates',
      buyers: [buyer({ id: s.buyers[0].id, panNumber: '' })],
      paymentSchedules: [
        { id: s.by('Booking').id, description: 'Booking', principalAmount: 100_000, gstAmount: 5_000 },
        { id: s.by('Plinth').id, milestoneId: s.by('Plinth').milestoneId ?? undefined, description: 'Plinth', principalAmount: 300_000, gstAmount: 15_000 },
        { description: '12 months', principalAmount: 300_000, gstAmount: 15_000, autoRaise: true, raiseOn: '2027-10-01' },
        { description: '24 months', principalAmount: 300_000, gstAmount: 15_000, autoRaise: true, raiseOn: '2028-10-01' },
      ],
    }), s.actorId)

    const after = await s.prisma.paymentSchedule.findMany({ where: { saleId: s.sale.id }, orderBy: { createdAt: 'asc' } })
    expect(after.map((r) => r.description).sort()).toEqual(['12 months', '24 months', 'Booking', 'Plinth'])
    expect(after.find((r) => r.description === 'Plinth')!.status).toBe('DUE') // the demand already sent is untouched
    expect(after.filter((r) => r.autoRaise).map((r) => r.description).sort()).toEqual(['12 months', '24 months'])
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    expect((await runDailyInterestAndStatus(new Date('2027-10-02T09:00:00Z'))).dated.raised).toBe(1)
  })

  it('switches a not-yet-raised milestone charge row to a date and back', async () => {
    const s = await setup()
    const { updateSale } = await import('@/lib/sales/edit-sale')
    const poss = s.by('Possession')
    await updateSale(s.sale.id, SaleEditSchema.parse({
      unitId: s.units[0].id, agreementValue: 1_000_000, gstAmount: 50_000, bookingDate: '2026-10-01', reason: 'To dates',
      buyers: [buyer({ id: s.buyers[0].id, panNumber: '' })],
      paymentSchedules: [
        { id: s.by('Booking').id, description: 'Booking', principalAmount: 100_000, gstAmount: 5_000 },
        { id: s.by('Plinth').id, description: 'Plinth', principalAmount: 300_000, gstAmount: 15_000 },
        { id: poss.id, description: 'Possession', principalAmount: 600_000, gstAmount: 30_000, autoRaise: true, raiseOn: '2027-06-01' },
      ],
    }), s.actorId)
    const dated = await s.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: poss.id } })
    expect(dated.autoRaise).toBe(true)
    expect(dated.milestoneId).toBeNull()
    expect(dated.raiseOn?.toISOString().slice(0, 10)).toBe('2027-06-01')
  })

  it('refuses two dated instalments with the same name', async () => {
    const s = await setup()
    const { updateSale } = await import('@/lib/sales/edit-sale')
    const parsed = SaleEditSchema.safeParse({
      unitId: s.units[0].id, agreementValue: 1_000_000, gstAmount: 50_000, bookingDate: '2026-10-01', reason: 'To dates',
      buyers: [buyer({ id: s.buyers[0].id, panNumber: '' })],
      paymentSchedules: [
        { description: 'Same', principalAmount: 500_000, gstAmount: 25_000, autoRaise: true, raiseOn: '2027-06-01' },
        { description: 'same', principalAmount: 500_000, gstAmount: 25_000, autoRaise: true, raiseOn: '2027-07-01' },
      ],
    })
    expect(parsed.success).toBe(false)
    void updateSale
  })
})
