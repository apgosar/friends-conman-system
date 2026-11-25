import { it, expect, beforeEach, vi } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'

const sendText = vi.fn<(to: string, text: string) => Promise<{ messageId: string; status: string }>>()
vi.mock('@/lib/whatsapp', async (orig) => ({ ...(await orig<typeof import('@/lib/whatsapp')>()), sendWhatsAppText: (to: string, text: string) => sendText(to, text) }))

describeDb('the Gupshup callback', () => {
  beforeEach(async () => { await resetDb(); sendText.mockReset(); sendText.mockResolvedValue({ messageId: 'r1', status: 'sent' }); delete process.env.GUPSHUP_AUTO_REPLY_TEXT })

  async function seed() {
    const prisma = await getPrisma()
    await seedUser('ADMIN')
    const { project, units } = await seedProject({ units: 1 })
    const sale = await prisma.sale.create({ data: { saleNumber: 'S-1', projectId: project.id, unitId: units[0].id, agreementValue: 1_000_000, gstAmount: 0, bookingDate: new Date(), status: 'BOOKED' } })
    const buyer = await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Asha Rao', whatsappNumber: '9876543210', isPrimary: true, sequence: 1 } })
    const log = await prisma.communicationLog.create({ data: { saleId: sale.id, buyerId: buyer.id, channel: 'WHATSAPP', type: 'RECEIPT', status: 'SENT', providerMessageId: 'gs-1', sentAt: new Date('2026-11-25T06:00:00Z') } })
    return { prisma, sale, buyer, log }
  }
  const event = (type: string, ts: number, extra: object = {}) => ({ type: 'message-event', payload: { id: 'wamid-1', gsId: 'gs-1', type, destination: '919876543210', payload: { ts, ...extra } } })

  it('records delivered and read times, and never moves a message back', async () => {
    const { prisma, log } = await seed()
    const { handleGupshupEvent } = await import('@/lib/gupshup-callback')
    await handleGupshupEvent(event('delivered', 1_795_000_000_000))
    let row = await prisma.communicationLog.findUniqueOrThrow({ where: { id: log.id } })
    expect(row.status).toBe('DELIVERED')
    expect(row.deliveredAt?.getTime()).toBe(1_795_000_000_000)
    await handleGupshupEvent(event('read', 1_795_000_060_000))
    await handleGupshupEvent(event('sent', 1_794_999_999_000)) // arrives late
    row = await prisma.communicationLog.findUniqueOrThrow({ where: { id: log.id } })
    expect(row.status).toBe('READ')
    expect(row.readAt?.getTime()).toBe(1_795_000_060_000)
  })

  it('marks a failed message with a plain reason', async () => {
    const { prisma, log } = await seed()
    const { handleGupshupEvent } = await import('@/lib/gupshup-callback')
    await handleGupshupEvent(event('failed', 1_795_000_000_000, { reason: 'Message undeliverable' }))
    const row = await prisma.communicationLog.findUniqueOrThrow({ where: { id: log.id } })
    expect(row.status).toBe('FAILED')
    expect(row.failureReason).toContain('Message undeliverable')
  })

  it('ignores an event for a message that is not ours', async () => {
    const { handleGupshupEvent } = await import('@/lib/gupshup-callback')
    await expect(handleGupshupEvent({ type: 'message-event', payload: { id: 'x', gsId: 'y', type: 'read', payload: { ts: 1 } } })).resolves.toBeUndefined()
  })

  const incoming = (id: string) => ({ type: 'message', payload: { id, source: '919876543210', type: 'text', payload: { text: 'Hello' }, sender: { phone: '919876543210', name: 'Asha' } } })

  it('keeps a message sent to the number and answers it once a day, and not twice for a repeated callback', async () => {
    const { prisma, buyer } = await seed()
    const { handleGupshupEvent } = await import('@/lib/gupshup-callback')
    await handleGupshupEvent(incoming('in-1'))
    await handleGupshupEvent(incoming('in-1')) // the same callback again
    await handleGupshupEvent(incoming('in-2')) // another message the same day
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendText.mock.calls[0][0]).toBe('919876543210')
    const rows = await prisma.whatsAppInbound.findMany({ orderBy: { receivedAt: 'asc' } })
    expect(rows).toHaveLength(2)
    expect(rows[0].buyerId).toBe(buyer.id)
    expect(rows[0].autoRepliedAt).not.toBeNull()
    expect(rows[1].autoRepliedAt).toBeNull()
  })

  it('does not answer when the auto-reply is off', async () => {
    await seed()
    process.env.GUPSHUP_AUTO_REPLY_TEXT = 'off'
    const { handleGupshupEvent } = await import('@/lib/gupshup-callback')
    await handleGupshupEvent(incoming('in-3'))
    expect(sendText).not.toHaveBeenCalled()
  })
})
