import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMAND_TEMPLATE, QUOTATION_TEMPLATE, sendWhatsApp } from '@/lib/whatsapp'

const env = { GUPSHUP_API_KEY: 'key-123', GUPSHUP_SOURCE: '+91 98765 43210', GUPSHUP_APP_NAME: 'NeevApp', GUPSHUP_TEMPLATE_DEMANDS_AND_RECEIPTS: 'tpl-demand', GUPSHUP_TEMPLATE_QUOTATION: 'tpl-quote' }
const msg = { to: '919000000001', message: 'x', templateName: DEMAND_TEMPLATE, templateBodyParams: ['Asha', 'Sea View'], documentHeaderUrl: 'https://x.test/a.pdf', documentHeaderFilename: 'A.pdf' }

describe('sending WhatsApp through Gupshup', () => {
  const saved = { ...process.env }
  beforeEach(() => { Object.assign(process.env, env) })
  afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals() })

  it('only simulates when the account is not set up', async () => {
    delete process.env.GUPSHUP_API_KEY
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    expect((await sendWhatsApp(msg)).status).toBe('simulated')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the template by its id, with the parameters and the PDF header', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'submitted', messageId: 'm-1' }), { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await sendWhatsApp(msg)).toEqual({ messageId: 'm-1', status: 'sent' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.gupshup.io/wa/api/v1/template/msg')
    expect((init.headers as Record<string, string>).apikey).toBe('key-123')
    const form = new URLSearchParams(String(init.body))
    expect(form.get('source')).toBe('919876543210')
    expect(form.get('destination')).toBe('919000000001')
    expect(form.get('src.name')).toBe('NeevApp')
    expect(JSON.parse(form.get('template')!)).toEqual({ id: 'tpl-demand', params: ['Asha', 'Sea View'] })
    expect(JSON.parse(form.get('message')!)).toEqual({ type: 'document', document: { link: 'https://x.test/a.pdf', filename: 'A.pdf' } })
  })

  it('uses the template id of the quotation template, and no header when there is no link', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'submitted', messageId: 'm-2' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await sendWhatsApp({ ...msg, templateName: QUOTATION_TEMPLATE, documentHeaderUrl: undefined })
    const form = new URLSearchParams(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(JSON.parse(form.get('template')!).id).toBe('tpl-quote')
    expect(form.has('message')).toBe(false)
  })

  it('fails with a readable reason when Gupshup refuses, and when the template id is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'error', message: 'Invalid Destination' }), { status: 400 })))
    await expect(sendWhatsApp(msg)).rejects.toThrow('Invalid Destination')
    delete process.env.GUPSHUP_TEMPLATE_DEMANDS_AND_RECEIPTS
    await expect(sendWhatsApp(msg)).rejects.toThrow('template ID is not set for demands_and_receipts_v2')
  })
})
