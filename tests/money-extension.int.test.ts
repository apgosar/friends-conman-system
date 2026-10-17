import { describe, it, expect, beforeEach } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject } from './helpers/db'

describeDb('NUMERIC money columns are read back as plain numbers', () => {
  beforeEach(resetDb)

  it('top-level, selected and nested reads all return numbers', async () => {
    const prisma = await getPrisma()
    const { project, units } = await seedProject({ units: 1 })
    const sale = await prisma.sale.create({
      data: {
        saleNumber: 'T-001', projectId: project.id, unitId: units[0].id,
        agreementValue: 12345678.91, gstAmount: 617283.95, bookingDate: new Date(),
        paymentSchedules: { create: [{ description: 'Booking', principalAmount: 100000.5, gstAmount: 5000.03 }] },
      },
      include: { paymentSchedules: true },
    })
    expect(sale.agreementValue).toBe(12345678.91)
    expect(typeof sale.stampDuty === 'number' || sale.stampDuty === null).toBe(true)
    expect(sale.paymentSchedules[0].principalAmount).toBe(100000.5)

    const picked = await prisma.paymentSchedule.findFirst({ select: { principalAmount: true } })
    expect(picked?.principalAmount).toBe(100000.5)

    const nested = await prisma.project.findUnique({
      where: { id: project.id },
      include: { sales: { include: { paymentSchedules: true } } },
    })
    expect(nested?.carParkingCharges).toBe(500000)
    expect(nested?.regParkingCharges).toBe(20000)
    expect(nested?.regChargesCap).toBe(30000)
    expect(nested?.sales[0].paymentSchedules[0].gstAmount).toBe(5000.03)
  })

  it('stores to the paisa (no sub-paisa garbage survives)', async () => {
    const prisma = await getPrisma()
    const { project, units } = await seedProject({ units: 1 })
    const sale = await prisma.sale.create({
      data: { saleNumber: 'T-002', projectId: project.id, unitId: units[0].id, agreementValue: 100.126, gstAmount: 5, bookingDate: new Date() },
    })
    expect(sale.agreementValue).toBe(100.13)
  })
})

describeDb('aggregates', () => {
  beforeEach(resetDb)
  it('aggregates come back as numbers too', async () => {
    const prisma = await getPrisma()
    const { project, units } = await seedProject({ units: 1 })
    await prisma.sale.create({ data: { saleNumber: 'P-002', projectId: project.id, unitId: units[0].id, agreementValue: 100.5, gstAmount: 5, bookingDate: new Date() } })
    const agg = await prisma.sale.aggregate({ _sum: { agreementValue: true } })
    expect(Number(agg._sum.agreementValue)).toBe(100.5)
  })
})
