import { describe, it, expect, beforeEach } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject } from './helpers/db'

async function saleWithDemand(status: string, deletedAt: Date | null = null) {
  const prisma = await getPrisma()
  const { project, units } = await seedProject({ units: 1 })
  const sale = await prisma.sale.create({
    data: { saleNumber: `S-${Math.random().toString(36).slice(2, 7)}`, projectId: project.id, unitId: units[0].id, agreementValue: 1000, gstAmount: 0, bookingDate: new Date(), status, deletedAt },
  })
  const schedule = await prisma.paymentSchedule.create({
    data: { saleId: sale.id, description: 'Plinth', principalAmount: 1000, gstAmount: 0, status: 'DUE', demandGeneratedDate: new Date(Date.now() - 40 * 86400000), dueDate: new Date(Date.now() - 26 * 86400000) },
  })
  return { prisma, project, unit: units[0], sale, schedule }
}

describeDb('cancelled and deleted sales', () => {
  beforeEach(resetDb)

  it('do not lock the unit or count towards a project (only live sales do)', async () => {
    const { activeSale } = await import('@/lib/soft-delete')
    const { prisma, project, unit } = await saleWithDemand('CANCELLED')
    const u = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id }, include: { _count: { select: { sales: { where: activeSale } } } } })
    expect(u._count.sales).toBe(0)
    const p = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, include: { _count: { select: { sales: { where: activeSale } } } } })
    expect(p._count.sales).toBe(0)
  })

  it('a live sale does lock the unit', async () => {
    const { activeSale } = await import('@/lib/soft-delete')
    const { prisma, unit } = await saleWithDemand('BOOKED')
    const u = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id }, include: { _count: { select: { sales: { where: activeSale } } } } })
    expect(u._count.sales).toBe(1)
  })

  it('their demands are no longer aged, charged interest or listed as receivables', async () => {
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    const { activeSale } = await import('@/lib/soft-delete')
    const live = await saleWithDemand('BOOKED')
    const dead = await saleWithDemand('CANCELLED', new Date())
    await runDailyInterestAndStatus()
    const liveRow = await live.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: live.schedule.id } })
    const deadRow = await dead.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: dead.schedule.id } })
    expect(liveRow.interestAmount).toBeGreaterThan(0)
    expect(deadRow.interestAmount).toBe(0)
    expect(deadRow.status).toBe('DUE')
    const receivables = await live.prisma.paymentSchedule.findMany({ where: { status: { in: ['DUE', 'OVERDUE_30', 'OVERDUE_15', 'OVERDUE_7', 'OVERDUE_30PLUS'] }, sale: activeSale } })
    expect(receivables.map((r) => r.id)).toEqual([live.schedule.id])
  })
})

describeDb('overdue interest follows the project setting', () => {
  beforeEach(resetDb)
  it('a project charging 24% accrues twice what one charging 12% does', async () => {
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    const a = await saleWithDemand('BOOKED')
    const b = await saleWithDemand('BOOKED')
    await a.prisma.project.update({ where: { id: a.project.id }, data: { interestRatePercent: 12 } })
    await b.prisma.project.update({ where: { id: b.project.id }, data: { interestRatePercent: 24 } })
    await runDailyInterestAndStatus()
    const ia = (await a.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: a.schedule.id } })).interestAmount
    const ib = (await b.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: b.schedule.id } })).interestAmount
    expect(ia).toBeGreaterThan(0)
    expect(ib).toBeCloseTo(ia * 2, 1)
  })
})
