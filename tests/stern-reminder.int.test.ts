import { it, expect, beforeEach, vi } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'
import { SaleCreateSchema } from '@/lib/sales/create-sale'

const whatsapp = vi.hoisted(() => vi.fn(async () => ({ messageId: 'm-1', status: 'sent' })))
vi.mock('@/lib/whatsapp', async (orig) => ({ ...(await orig<typeof import('@/lib/whatsapp')>()), sendWhatsApp: whatsapp }))

const buyer = { fullName: 'Asha Rao', email: 'asha@example.com', whatsappNumber: '9876543210', panNumber: 'ABCDE1234F', aadhaarNumber: '', address: '12 MG Road, Pune' }
const DAY = 86_400_000

describeDb('the stern reminder', () => {
  beforeEach(resetDb)

  async function overdueDemand(commsEnabled = true, late = 40) {
    const prisma = await getPrisma()
    const actor = await seedUser('ADMIN')
    const { project, units } = await seedProject({ units: 1 })
    await prisma.project.update({ where: { id: project.id }, data: { demandDueDays: 10 } })
    const milestone = await prisma.constructionMilestone.create({ data: { projectId: project.id, name: '6th Slab', sequence: 1, percentOfAV: 100, status: 'COMPLETED', actualDate: new Date(Date.now() - 40 * DAY) } })
    const { createSale } = await import('@/lib/sales/create-sale')
    const sale = await createSale(SaleCreateSchema.parse({
      projectId: project.id, unitId: units[0].id, agreementValue: 1_000_000, gstAmount: 50_000, bookingDate: new Date().toISOString().slice(0, 10), buyers: [buyer],
      paymentSchedules: [{ milestoneId: milestone.id, description: '6th Slab', principalAmount: 1_000_000, gstAmount: 50_000 }],
    }), actor.id)
    const created = await prisma.paymentSchedule.findFirstOrThrow({ where: { saleId: sale.id } })
    await prisma.sale.update({ where: { id: sale.id }, data: { commsEnabled } })
    await prisma.paymentSchedule.update({ where: { id: created.id }, data: { dueDate: new Date(Date.now() - late * DAY), status: late > 30 ? 'OVERDUE_30PLUS' : 'OVERDUE_30', managementEscalated: true } })
    await prisma.communicationLog.deleteMany({})
    return { prisma, actor, sale, schedule: created }
  }

  it('gives a demand raised for a milestone completed earlier its full due days from today', async () => {
    const s = await overdueDemand()
    expect(Math.round((s.schedule.dueDate!.getTime() - Date.now()) / DAY)).toBe(10)
  })

  it('queues an email and a WhatsApp message with what is still owed, once', async () => {
    const s = await overdueDemand()
    await s.prisma.payment.create({ data: { scheduleId: s.schedule.id, saleId: s.sale.id, amount: 400_000, gstPaid: 0, mode: 'NEFT', paymentDate: new Date(), receiptNumber: 'R-1' } })
    const { sendSternReminder } = await import('@/lib/stern-reminder')
    expect(await sendSternReminder(s.schedule.id, s.actor)).toEqual({ messages: 2 })
    const logs = await s.prisma.communicationLog.findMany({ where: { saleId: s.sale.id } })
    expect(logs.map((l) => `${l.type} ${l.channel} ${l.status}`).sort()).toEqual(['STERN_REMINDER EMAIL PENDING', 'STERN_REMINDER WHATSAPP PENDING'])
    expect(logs[0].messageContent).toContain('overdue by 40 days')
    expect(logs[0].messageContent).toContain('6,50,000')
    expect((await s.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: s.schedule.id } })).managementApprovedStern).toBe(true)
    await expect(sendSternReminder(s.schedule.id, s.actor)).rejects.toThrow('already been sent')
    expect(await s.prisma.communicationLog.count()).toBe(2)
  })

  it('is for payments more than 30 days overdue only', async () => {
    const s = await overdueDemand(true, 30)
    const { sendSternReminder } = await import('@/lib/stern-reminder')
    const { listEscalations } = await import('@/lib/escalations')
    expect(await listEscalations()).toEqual([])
    await expect(sendSternReminder(s.schedule.id, s.actor)).rejects.toThrow('more than 30 days overdue')
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    await runDailyInterestAndStatus(new Date())
    expect((await s.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: s.schedule.id } })).managementEscalated).toBe(false)
    await runDailyInterestAndStatus(new Date(Date.now() + DAY)) // day 31
    expect((await s.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: s.schedule.id } })).managementEscalated).toBe(true)
  })

  it('shows the same message before sending as it then queues, without sending anything', async () => {
    const s = await overdueDemand()
    const { previewSternReminder, sendSternReminder } = await import('@/lib/stern-reminder')
    const preview = await previewSternReminder(s.schedule.id)
    expect(preview.subject).toBe('Final Payment Reminder — 6th Slab')
    expect(preview.messages).toMatchObject([{ buyerName: 'Asha Rao', email: 'asha@example.com' }])
    expect(await s.prisma.communicationLog.count()).toBe(0)
    await sendSternReminder(s.schedule.id, s.actor)
    const log = await s.prisma.communicationLog.findFirstOrThrow()
    expect(log.messageContent!.startsWith(preview.messages[0].text)).toBe(true)
  })

  it('fills the stern reminder template in the order of its variables', async () => {
    const s = await overdueDemand()
    const { sendSternReminder } = await import('@/lib/stern-reminder')
    await sendSternReminder(s.schedule.id, s.actor)
    const log = await s.prisma.communicationLog.findFirstOrThrow({ where: { channel: 'WHATSAPP' } })
    await s.prisma.communicationLog.update({ where: { id: log.id }, data: { attachments: [], messageContent: log.messageContent!.split('\n\nATTACHMENTS:')[0] } }) // no document server in a test
    const { dispatchCommunicationLog } = await import('@/lib/comms-dispatcher')
    expect((await dispatchCommunicationLog(log.id)).status).toBe('sent')
    const sent = (whatsapp.mock.calls as unknown as [{ templateName: string; templateBodyParams: string[] }][])[0][0]
    expect(sent.templateName).toBe('overdue_final_reminder')
    const [buyerName, , unit, payment, amount, due, days, , contact] = sent.templateBodyParams
    expect(sent.templateBodyParams).toHaveLength(9)
    expect([buyerName, payment, amount, days]).toEqual(['Asha Rao', '6th Slab', '10,50,000.00', '40'])
    expect(due).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    expect(unit && contact).toBeTruthy()
  })

  it('refuses when communication is off, and does not mark the demand', async () => {
    const s = await overdueDemand(false)
    const { sendSternReminder } = await import('@/lib/stern-reminder')
    await expect(sendSternReminder(s.schedule.id, s.actor)).rejects.toThrow('Communication is off')
    expect(await s.prisma.communicationLog.count()).toBe(0)
    expect((await s.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: s.schedule.id } })).managementApprovedStern).toBe(false)
  })

  it('lists the demand for management with the amount still owed', async () => {
    const s = await overdueDemand()
    const { listEscalations } = await import('@/lib/escalations')
    expect(await listEscalations()).toMatchObject([{ id: s.schedule.id, outstanding: 1_050_000, daysOverdue: 40, buyerName: 'Asha Rao', sternSent: false, commsEnabled: true }])
  })
})
