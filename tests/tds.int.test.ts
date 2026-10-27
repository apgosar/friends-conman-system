import { it, expect, beforeEach } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'

async function setup() {
  const prisma = await getPrisma()
  const user = await seedUser('ADMIN')
  const { project, units } = await seedProject({ name: 'Neev Heights', units: 1 })
  await prisma.project.update({ where: { id: project.id }, data: { tdsRatePercent: 1 } })
  const sale = await prisma.sale.create({
    data: { saleNumber: 'NH-001', projectId: project.id, unitId: units[0].id, agreementValue: 10_000_000, gstAmount: 500_000, bookingDate: new Date(), status: 'BOOKED' },
  })
  const booking = await prisma.paymentSchedule.create({ data: { saleId: sale.id, description: 'Booking', principalAmount: 1_000_000, gstAmount: 50_000, status: 'DUE' } })
  const slab = await prisma.paymentSchedule.create({ data: { saleId: sale.id, description: '6th Slab', principalAmount: 4_500_000, gstAmount: 225_000, status: 'UPCOMING' } })
  const stamp = await prisma.paymentSchedule.create({ data: { saleId: sale.id, description: 'Stamp Duty and Registration', principalAmount: 900_000, gstAmount: 0, status: 'UPCOMING' } })
  return { prisma, user, sale, booking, slab, stamp }
}

describeDb('recording TDS', () => {
  beforeEach(resetDb)

  it('adjusts TDS against the booking: principal is paid at 9% plus the TDS, GST stays due in full', async () => {
    const { recordTds } = await import('@/lib/payments/record-tds')
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { prisma, user, sale, booking } = await setup()

    await recordTds({ scheduleId: booking.id, saleId: sale.id, amount: 100_000, date: '2026-10-05' }, user.id)
    let row = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: booking.id } })
    expect(row.status).toBe('PARTIALLY_PAID')

    await recordPayment({ scheduleId: booking.id, saleId: sale.id, amount: 900_000, gstPaid: 0, mode: 'NEFT', paymentDate: '2026-10-06' }, user.id)
    row = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: booking.id } })
    expect(row.status).toBe('PARTIALLY_PAID') // the GST is still due

    // more than the principal that is left is refused: the 9% payment plus the 1% TDS cleared all of it
    await expect(recordPayment({ scheduleId: booking.id, saleId: sale.id, amount: 1, gstPaid: 0, mode: 'NEFT', paymentDate: '2026-10-06' }, user.id)).rejects.toMatchObject({ status: 400 })

    await recordPayment({ scheduleId: booking.id, saleId: sale.id, amount: 0, gstPaid: 50_000, mode: 'NEFT', paymentDate: '2026-10-07' }, user.id)
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('PAID')
  })

  it('sends no receipt, uses no receipt number from the sequence, and leaves the record as a TDS payment', async () => {
    const { recordTds } = await import('@/lib/payments/record-tds')
    const { prisma, user, sale, booking } = await setup()
    await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Asha', email: 'a@example.com', whatsappNumber: '9876543210', isPrimary: true } })
    const p = await recordTds({ scheduleId: booking.id, saleId: sale.id, amount: 100_000, date: '2026-10-05', referenceNumber: 'ACK1' }, user.id)
    expect(p).toMatchObject({ mode: 'TDS', amount: 100_000, gstPaid: 0, interestPaid: 0, referenceNumber: 'ACK1' })
    expect(p.receiptNumber).toMatch(/^TDS-/)
    expect(await prisma.communicationLog.count()).toBe(0)
  })

  it('cannot add up to more than the TDS rate of the agreement value, across the milestones', async () => {
    const { recordTds } = await import('@/lib/payments/record-tds')
    const { user, sale, booking, slab } = await setup()
    await recordTds({ scheduleId: booking.id, saleId: sale.id, amount: 60_000, date: '2026-10-05' }, user.id)
    await expect(recordTds({ scheduleId: slab.id, saleId: sale.id, amount: 60_000, date: '2026-10-05' }, user.id)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/still to be adjusted/) })
    await recordTds({ scheduleId: slab.id, saleId: sale.id, amount: 40_000, date: '2026-10-05' }, user.id) // exactly what is left
  })

  it('cannot be more than the principal outstanding on the milestone, nor go against stamp duty', async () => {
    const { recordTds } = await import('@/lib/payments/record-tds')
    const { prisma, user, sale, booking, stamp } = await setup()
    await prisma.project.updateMany({ data: { tdsRatePercent: 50 } }) // a limit high enough to reach the other rules
    await expect(recordTds({ scheduleId: booking.id, saleId: sale.id, amount: 1_000_001, date: '2026-10-05' }, user.id)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/principal still outstanding/) })
    await expect(recordTds({ scheduleId: stamp.id, saleId: sale.id, amount: 10, date: '2026-10-05' }, user.id)).rejects.toMatchObject({ status: 400 })
  })
})

describeDb('stamp duty and registration', () => {
  beforeEach(resetDb)

  it('cannot have a payment recorded against it', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { user, sale, stamp } = await setup()
    await expect(recordPayment({ scheduleId: stamp.id, saleId: sale.id, amount: 100, gstPaid: 0, mode: 'NEFT', paymentDate: '2026-10-05' }, user.id)).rejects.toMatchObject({ status: 400 })
  })

  it('is paid once the agreement date is recorded, and is not paid again if the date is cleared', async () => {
    const { syncSaleLifecycle } = await import('@/lib/sale-lifecycle')
    const { prisma, sale, stamp } = await setup()
    await prisma.sale.update({ where: { id: sale.id }, data: { agreementDate: new Date('2026-10-10') } })
    await syncSaleLifecycle(sale.id)
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: stamp.id } })).status).toBe('PAID')
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe('AGREEMENT_DONE')

    await prisma.sale.update({ where: { id: sale.id }, data: { agreementDate: null } })
    await syncSaleLifecycle(sale.id)
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: stamp.id } })).status).toBe('UPCOMING')
  })
})
