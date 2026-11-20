import { it, expect, beforeEach } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject } from './helpers/db'

const DAY = 86_400_000

/** One sale of a flat: two demands (one overdue by `daysLate`, one upcoming) and, optionally, a part payment. */
async function sale(opts: { project: Awaited<ReturnType<typeof seedProject>>; unitIndex: number; buyer: string; daysLate: number; paid?: number; status?: string }) {
  const prisma = await getPrisma()
  const { project, units } = opts.project
  const s = await prisma.sale.create({
    data: { saleNumber: `S-${Math.random().toString(36).slice(2, 8)}`, projectId: project.id, unitId: units[opts.unitIndex].id, agreementValue: 10_000_000, gstAmount: 500_000, bookingDate: new Date(), status: opts.status ?? 'IN_PROGRESS', ...(opts.status === 'CANCELLED' ? { deletedAt: new Date() } : {}) },
  })
  await prisma.buyer.create({ data: { saleId: s.id, fullName: opts.buyer, isPrimary: true, sequence: 1 } })
  const overdue = await prisma.paymentSchedule.create({
    data: { saleId: s.id, description: 'On Plinth', principalAmount: 2_000_000, gstAmount: 100_000, status: 'OVERDUE_30', demandGeneratedDate: new Date(Date.now() - (opts.daysLate + 14) * DAY), dueDate: new Date(Date.now() - opts.daysLate * DAY) },
  })
  await prisma.paymentSchedule.create({ data: { saleId: s.id, description: 'On First Slab', principalAmount: 1_000_000, gstAmount: 50_000, status: 'UPCOMING' } })
  if (opts.paid) await prisma.payment.create({ data: { scheduleId: overdue.id, saleId: s.id, amount: opts.paid, gstPaid: 0, mode: 'NEFT', paymentDate: new Date(), receiptNumber: `R-${Math.random().toString(36).slice(2, 8)}` } })
  return s
}

describeDb('Ask your data: the reports', () => {
  beforeEach(resetDb)

  it('lists overdue demands biggest first, with what is still owed after a part payment, and skips cancelled sales and demands not yet late enough', async () => {
    const { ASK_TOOLS } = await import('@/lib/ask-tools')
    const overdue = ASK_TOOLS.find((t) => t.declaration.name === 'overdue_demands')!
    const p = await seedProject({ name: 'Skyline Residency', units: 4 })
    await sale({ project: p, unitIndex: 0, buyer: 'Meera Joshi', daysLate: 61 })
    await sale({ project: p, unitIndex: 1, buyer: 'Sanjay Iyer', daysLate: 46, paid: 1_000_000 }) // owes 1,100,000 of 2,100,000
    await sale({ project: p, unitIndex: 2, buyer: 'Amit Desai', daysLate: 10 }) // not 30 days late
    await sale({ project: p, unitIndex: 3, buyer: 'Cancelled Buyer', daysLate: 90, status: 'CANCELLED' })

    const result = (await overdue.run({ minDaysOverdue: 30, project: 'skyline' })) as { demandCount: number; totalOverdue: { rupees: number }; shown: { buyer: string; wing: string; daysOverdue: number; outstanding: { rupees: number; text: string } }[] }
    expect(result.shown.map((r) => r.buyer)).toEqual(['Meera Joshi', 'Sanjay Iyer']) // biggest outstanding first
    expect(result.shown.map((r) => r.outstanding.rupees)).toEqual([2_100_000, 1_100_000])
    expect(result.shown[0].outstanding.text).toBe('₹21,00,000.00')
    expect(result.shown[0]).toMatchObject({ wing: 'A', daysOverdue: 61 })
    expect(result.demandCount).toBe(2)
    expect(result.totalOverdue.rupees).toBe(3_200_000)

    // the wing and project filters, in any case; a wing that does not exist gives nothing
    expect(((await overdue.run({ wing: 'Wing a' })) as { demandCount: number }).demandCount).toBe(3)
    expect(((await overdue.run({ wing: 'Z' })) as { demandCount: number }).demandCount).toBe(0)
    expect(((await overdue.run({ project: 'nothing like it' })) as { demandCount: number }).demandCount).toBe(0)
  })

  it('refuses arguments of the wrong shape instead of running a query', async () => {
    const { ASK_TOOLS } = await import('@/lib/ask-tools')
    const overdue = ASK_TOOLS.find((t) => t.declaration.name === 'overdue_demands')!
    await expect(overdue.run({ minDaysOverdue: 'many' })).rejects.toThrow()
    await expect(overdue.run({ limit: 5000 })).rejects.toThrow()
  })

  it('adds up what was collected by payment mode, without TDS credits and cancelled sales', async () => {
    const { ASK_TOOLS } = await import('@/lib/ask-tools')
    const collections = ASK_TOOLS.find((t) => t.declaration.name === 'collections')!
    const prisma = await getPrisma()
    const p = await seedProject({ units: 2 })
    const s = await sale({ project: p, unitIndex: 0, buyer: 'Meera Joshi', daysLate: 40 })
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { saleId: s.id } })
    const pay = (amount: number, mode: string, extra: Record<string, unknown> = {}) =>
      prisma.payment.create({ data: { scheduleId: schedule.id, saleId: s.id, amount, mode, paymentDate: new Date(), receiptNumber: `R-${Math.random().toString(36).slice(2, 8)}`, ...extra } })
    await pay(500_000, 'NEFT', { gstPaid: 0 })
    await pay(300_000, 'CHEQUE')
    await pay(20_000, 'TDS') // a credit against the demand, not money received
    await pay(999_999, 'UPI', { deletedAt: new Date() }) // deleted
    const cancelled = await sale({ project: p, unitIndex: 1, buyer: 'Gone', daysLate: 40, status: 'CANCELLED' })
    await prisma.payment.create({ data: { scheduleId: (await prisma.paymentSchedule.findFirstOrThrow({ where: { saleId: cancelled.id } })).id, saleId: cancelled.id, amount: 777_777, mode: 'NEFT', paymentDate: new Date(), receiptNumber: 'R-X' } })

    const result = (await collections.run({})) as { paymentCount: number; totalReceived: { rupees: number }; byMode: { mode: string; received: { rupees: number } }[] }
    expect(result.paymentCount).toBe(2)
    expect(result.totalReceived.rupees).toBe(800_000)
    expect(result.byMode.map((m) => [m.mode, m.received.rupees])).toEqual([['NEFT', 500_000], ['CHEQUE', 300_000]])

    const future = (await collections.run({ fromDate: '2099-01-01' })) as { paymentCount: number }
    expect(future.paymentCount).toBe(0) // a date range is honoured
  })

  it('counts units by status, lists the available ones, and finds a buyer by part of the name', async () => {
    const { ASK_TOOLS } = await import('@/lib/ask-tools')
    const find = (name: string) => ASK_TOOLS.find((t) => t.declaration.name === name)!
    const prisma = await getPrisma()
    const p = await seedProject({ name: 'Skyline Residency', units: 3 })
    await prisma.unit.update({ where: { id: p.units[0].id }, data: { status: 'BOOKED' } })
    await sale({ project: p, unitIndex: 0, buyer: 'Rahul Sharma', daysLate: 20, paid: 100_000 })

    const inventory = (await find('inventory_summary').run({ project: 'skyline' })) as { totalUnits: number; byStatus: { status: string; units: number }[]; availableByFlatType: { flatType: string; units: number }[] }
    expect(inventory.totalUnits).toBe(3)
    expect(Object.fromEntries(inventory.byStatus.map((s) => [s.status, s.units]))).toEqual({ Available: 2, Booked: 1 })
    expect(inventory.availableByFlatType).toEqual([{ flatType: '2BHK', units: 2 }])

    const available = (await find('available_units').run({ configuration: '2bhk', limit: 1 })) as { availableCount: number; shown: { wing: string; flatType: string }[] }
    expect(available.availableCount).toBe(2)
    expect(available.shown).toHaveLength(1)
    expect(available.shown[0]).toMatchObject({ wing: 'A', flatType: '2BHK' })

    const dues = (await find('buyer_dues').run({ buyerName: 'sharma' })) as { matches: number; shown: { buyer: string; paidSoFar: { rupees: number }; outstandingOnDemandsRaised: { rupees: number } }[] }
    expect(dues.matches).toBe(1)
    expect(dues.shown[0]).toMatchObject({ buyer: 'Rahul Sharma', paidSoFar: { rupees: 100_000 }, outstandingOnDemandsRaised: { rupees: 2_000_000 } }) // 2,100,000 demand less 100,000 paid; the upcoming demand is not counted
  })

  it('summarises sales by project and flat type', async () => {
    const { ASK_TOOLS } = await import('@/lib/ask-tools')
    const summary = ASK_TOOLS.find((t) => t.declaration.name === 'sales_summary')!
    const p = await seedProject({ name: 'Skyline Residency', units: 2 })
    await sale({ project: p, unitIndex: 0, buyer: 'A', daysLate: 5 })
    await sale({ project: p, unitIndex: 1, buyer: 'B', daysLate: 5 })
    const result = (await summary.run({})) as { salesCount: number; totalAgreementValue: { rupees: number }; byProject: { name: string; sales: number }[]; byFlatType: { name: string; sales: number }[] }
    expect(result.salesCount).toBe(2)
    expect(result.totalAgreementValue.rupees).toBe(20_000_000)
    expect(result.byProject).toMatchObject([{ name: 'Skyline Residency', sales: 2 }])
    expect(result.byFlatType).toMatchObject([{ name: '2BHK', sales: 2 }])
  })
})
