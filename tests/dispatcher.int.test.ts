import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject } from './helpers/db'

const sendEmail = vi.fn(async (_opts: any) => ({ messageId: 'm-1' }))
vi.mock('@/lib/email', () => ({ sendEmail: (opts: any) => sendEmail(opts) }))
vi.mock('@/lib/whatsapp', () => ({ sendWhatsApp: vi.fn(async () => ({ status: 'simulated', messageId: 'w-1' })) }))

const SECRET = 'a-proper-long-shared-secret-1234'
const pdfResponse = () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { 'content-type': 'application/pdf' } })

async function seedLog(messageContent: string, attachments?: unknown, over: Record<string, unknown> = {}) {
  const prisma = await getPrisma()
  const { project, units } = await seedProject({ units: 1 })
  const sale = await prisma.sale.create({ data: { saleNumber: `D-${Math.random().toString(36).slice(2, 8)}`, projectId: project.id, unitId: units[0].id, agreementValue: 1, gstAmount: 0, bookingDate: new Date() } })
  const buyer = await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Asha <b>Rao</b>', email: 'asha@example.com', isPrimary: true } })
  return prisma.communicationLog.create({
    data: { saleId: sale.id, buyerId: buyer.id, channel: 'EMAIL', type: 'DEMAND_LETTER', messageContent, attachments: attachments as any, status: 'PENDING', ...over },
  })
}

describeDb('communications dispatcher', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(async () => {
    await resetDb()
    sendEmail.mockClear()
    process.env.APP_URL = 'https://app.example.com'
    process.env.CRON_SECRET = SECRET
    fetchMock = vi.fn(async () => pdfResponse())
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends a message exactly once even when two dispatch runs overlap', async () => {
    const { dispatchCommunicationLog } = await import('@/lib/comms-dispatcher')
    const log = await seedLog('Dear Asha,\nHello.')
    const results = await Promise.all([dispatchCommunicationLog(log.id), dispatchCommunicationLog(log.id), dispatchCommunicationLog(log.id)])
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(results.filter((r) => r.status === 'sent')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'skipped')).toHaveLength(2)
    const row = await (await getPrisma()).communicationLog.findUniqueOrThrow({ where: { id: log.id } })
    expect(row.status).toBe('SENT')
    expect(row.claimedAt).toBeNull()
  })

  it('does not send a message that was already sent', async () => {
    const { dispatchCommunicationLog } = await import('@/lib/comms-dispatcher')
    const log = await seedLog('Hi', undefined, { status: 'SENT' })
    expect((await dispatchCommunicationLog(log.id)).status).toBe('skipped')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('attaches documents from this app only, sending the internal token to that origin and nowhere else', async () => {
    const { dispatchCommunicationLog } = await import('@/lib/comms-dispatcher')
    const log = await seedLog('Dear Asha,\nYour receipt.', [{ label: 'Receipt', path: '/api/documents/preview/receipt?paymentId=p1' }])
    expect((await dispatchCommunicationLog(log.id)).status).toBe('sent')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://app.example.com/api/documents/preview/receipt?paymentId=p1&format=pdf')
    expect((init.headers as Record<string, string>)['x-internal-token']).toBe(SECRET)
    expect(sendEmail.mock.calls[0][0].attachments).toHaveLength(1)
  })

  for (const [label, path] of [
    ['a look-alike host', 'https://app.example.com.evil.net/api/files/x'],
    ['the cloud metadata address', 'http://169.254.169.254/latest/meta-data/'],
    ['another route of this app', '/api/users'],
  ] as const) {
    it(`refuses to fetch ${label}: nothing is requested, nothing is sent, the log says why`, async () => {
      const { dispatchCommunicationLog } = await import('@/lib/comms-dispatcher')
      const log = await seedLog('Dear Asha,\nHello.', [{ label: 'Bad', path }])
      const result = await dispatchCommunicationLog(log.id)
      expect(result.status).toBe('failed')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(sendEmail).not.toHaveBeenCalled()
      const row = await (await getPrisma()).communicationLog.findUniqueOrThrow({ where: { id: log.id } })
      expect(row.status).toBe('FAILED')
      expect(row.failureReason).toMatch(/Attachment/)
    })
  }

  it('a legacy row (attachments only in the text) is held to the same rules', async () => {
    const { dispatchCommunicationLog } = await import('@/lib/comms-dispatcher')
    const log = await seedLog('Dear Eve,\nHi\n\nATTACHMENTS:\nSecret|http://169.254.169.254/latest/meta-data/')
    expect((await dispatchCommunicationLog(log.id)).status).toBe('failed')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('escapes customer-supplied text in the HTML email', async () => {
    const { dispatchCommunicationLog } = await import('@/lib/comms-dispatcher')
    const log = await seedLog('Dear <img src=x onerror=alert(1)>,\nPay <script>steal()</script> now.')
    await dispatchCommunicationLog(log.id)
    const html: string = sendEmail.mock.calls[0][0].html
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('uses the configured company name, not a hard-coded one', async () => {
    const { dispatchCommunicationLog } = await import('@/lib/comms-dispatcher')
    process.env.COMPANY_NAME = 'Acme Builders'
    const log = await seedLog('Dear Asha,\nHi.')
    await dispatchCommunicationLog(log.id)
    expect(sendEmail.mock.calls[0][0].html).toContain('Acme Builders')
    expect(sendEmail.mock.calls[0][0].html).not.toContain('PARADIGM')
    delete process.env.COMPANY_NAME
  })

  it('puts messages whose worker died back in the queue, and then sends them', async () => {
    const { dispatchAllPending } = await import('@/lib/comms-dispatcher')
    const stale = await seedLog('Dear Asha,\nStuck.', undefined, { status: 'SENDING', claimedAt: new Date(Date.now() - 60 * 60 * 1000) })
    const fresh = await seedLog('Dear Asha,\nIn flight.', undefined, { status: 'SENDING', claimedAt: new Date() })
    await dispatchAllPending()
    const prisma = await getPrisma()
    expect((await prisma.communicationLog.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('SENT')
    expect((await prisma.communicationLog.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe('SENDING')
  })
})
