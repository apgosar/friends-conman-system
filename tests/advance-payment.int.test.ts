import { it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'

// Messages are queued, not sent
vi.mock('@/lib/comms-dispatcher', () => ({ dispatchAllPending: async () => [] }))
let actorId = 'u1'
vi.mock('@/lib/guard', () => ({ requireRole: async () => ({ user: { id: actorId, role: 'ADMIN' } }) }))

const DAY = 86_400_000

/** Three sales on one project, each with a demand for the Plinth milestone (1,00,000 + 5,000 GST), not yet raised. */
async function setup() {
  const prisma = await getPrisma()
  const user = await seedUser('ADMIN')
  actorId = user.id
  const { project, units } = await seedProject({ name: 'Neev Heights', units: 3 })
  const milestone = await prisma.constructionMilestone.create({ data: { projectId: project.id, name: 'Plinth', sequence: 1, status: 'UPCOMING' } })
  const sale = async (n: number) => {
    const s = await prisma.sale.create({
      data: { saleNumber: `NH-00${n}`, projectId: project.id, unitId: units[n].id, agreementValue: 1_000_000, gstAmount: 50_000, bookingDate: new Date(), status: 'IN_PROGRESS' },
    })
    await prisma.buyer.create({ data: { saleId: s.id, fullName: `Buyer ${n}`, email: `b${n}@example.com`, isPrimary: true, sequence: 1 } })
    const schedule = await prisma.paymentSchedule.create({
      data: { saleId: s.id, milestoneId: milestone.id, description: 'Plinth', principalAmount: 100_000, gstAmount: 5_000, status: 'UPCOMING' },
    })
    return { sale: s, schedule }
  }
  return { prisma, user, milestone, part: await sale(0), full: await sale(1), none: await sale(2) }
}

const pay = (a: { sale: { id: string }; schedule: { id: string } }, amount: number, gstPaid = 0) =>
  ({ scheduleId: a.schedule.id, saleId: a.sale.id, amount, gstPaid, interestPaid: 0, mode: 'NEFT', paymentDate: new Date().toISOString() })

const complete = async (milestoneId: string) => {
  const { POST } = await import('@/app/api/milestones/[id]/complete/route')
  const req = new NextRequest('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ architectCertificateUrl: '/api/files/cert.pdf' }) })
  return POST(req, { params: Promise.resolve({ id: milestoneId }) })
}

describeDb('advance payments against a milestone still to come', () => {
  beforeEach(resetDb)

  it('leave the demand Upcoming, owing nothing yet: no overdue, no interest, no reminder', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    const { prisma, user, part } = await setup()
    await recordPayment(pay(part, 40_000), user.id)

    expect(await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: part.schedule.id } })).toMatchObject({ status: 'UPCOMING', demandGeneratedDate: null })
    expect(await prisma.communicationLog.count({ where: { type: 'RECEIPT' } })).toBe(1) // the receipt still goes
    const later = await runDailyInterestAndStatus(new Date(Date.now() + 60 * DAY))
    expect(later.reminders).toEqual({ demands: 0, messages: 0 })
    expect(await prisma.interestAccrual.count()).toBe(0)
  })

  it('are billed for the balance only when the milestone is completed; one paid in full gets no letter', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { prisma, user, milestone, part, full, none } = await setup()
    await recordPayment(pay(part, 40_000), user.id)
    await recordPayment(pay(full, 100_000), user.id)
    await recordPayment(pay(full, 0, 5_000), user.id)
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: full.schedule.id } })).status).toBe('PAID')

    expect((await complete(milestone.id)).status).toBe(200)
    const [p, f, n] = await Promise.all([part, full, none].map((x) => prisma.paymentSchedule.findUniqueOrThrow({ where: { id: x.schedule.id } })))
    expect(p).toMatchObject({ status: 'PARTIALLY_PAID', demandGeneratedDate: expect.any(Date), dueDate: expect.any(Date) })
    expect(f).toMatchObject({ status: 'PAID', demandGeneratedDate: expect.any(Date) })
    expect(n).toMatchObject({ status: 'DUE', demandGeneratedDate: expect.any(Date) })

    const letters = await prisma.communicationLog.findMany({ where: { type: 'DEMAND_LETTER' } })
    expect(letters.map((l) => l.saleId).sort()).toEqual([none.sale.id, part.sale.id].sort())
    const partLetter = letters.find((l) => l.saleId === part.sale.id)!.messageContent!
    expect(partLetter).toContain('Demand Letter for ₹65,000 (the balance after the advance of ₹40,000 already received)')
    expect(letters.find((l) => l.saleId === none.sale.id)!.messageContent).toContain('Demand Letter for ₹1,05,000 and')

    // Completing again raises and sends nothing more
    await complete(milestone.id)
    expect(await prisma.communicationLog.count({ where: { type: 'DEMAND_LETTER' } })).toBe(2)
  })

  it('once billed, the balance is chased like any demand: reminders, and Paid when it is cleared', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { queuePaymentReminders } = await import('@/lib/reminders')
    const { prisma, user, milestone, part } = await setup()
    await recordPayment(pay(part, 40_000), user.id)
    await complete(milestone.id)

    expect(await queuePaymentReminders(new Date(Date.now() + 7 * DAY))).toMatchObject({ demands: 3 }) // this one and the two sales that paid nothing
    const reminder = await prisma.communicationLog.findFirstOrThrow({ where: { type: 'PAYMENT_REMINDER', saleId: part.sale.id } })
    expect(reminder.messageContent).toContain('Amount outstanding: ₹65,000.00')

    await recordPayment(pay(part, 60_000), user.id)
    await recordPayment(pay(part, 0, 5_000), user.id)
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: part.schedule.id } })).status).toBe('PAID')
  })

  it('a TDS entry on a demand not yet raised also leaves it Upcoming', async () => {
    const { recordTds } = await import('@/lib/payments/record-tds')
    const { prisma, user, part } = await setup()
    await recordTds({ scheduleId: part.schedule.id, saleId: part.sale.id, amount: 1_000, date: new Date().toISOString().slice(0, 10) }, user.id)
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: part.schedule.id } })).status).toBe('UPCOMING')
  })

  it('the migration puts right the demands left Partially Paid but never raised', async () => {
    const { prisma, milestone, part, full } = await setup()
    const done = await prisma.constructionMilestone.create({ data: { projectId: milestone.projectId, name: 'Slab', sequence: 2, status: 'COMPLETED', actualDate: new Date() } })
    await prisma.paymentSchedule.update({ where: { id: part.schedule.id }, data: { status: 'PARTIALLY_PAID' } }) // milestone still to come
    await prisma.paymentSchedule.update({ where: { id: full.schedule.id }, data: { status: 'PARTIALLY_PAID', milestoneId: done.id } }) // completed, skipped

    const sql = readFileSync('prisma/migrations/20261113000000_advance_payment_demands/migration.sql', 'utf8')
    for (const statement of sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement)

    expect(await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: part.schedule.id } })).toMatchObject({ status: 'UPCOMING', demandGeneratedDate: null })
    const raised = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: full.schedule.id } })
    expect(raised.status).toBe('PARTIALLY_PAID')
    expect(Math.round((raised.dueDate!.getTime() - raised.demandGeneratedDate!.getTime()) / DAY)).toBe(14)
  })
})
