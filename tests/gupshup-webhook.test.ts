import { it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

const handle = vi.fn(async () => undefined)
vi.mock('@/lib/gupshup-callback', () => ({ handleGupshupEvent: (...a: unknown[]) => (handle as any)(...a) }))

const call = async (token: string | null, body: unknown) => {
  const { POST } = await import('@/app/api/webhooks/gupshup/route')
  const url = `http://localhost/api/webhooks/gupshup${token === null ? '' : `?token=${token}`}`
  return POST(new NextRequest(url, { method: 'POST', body: JSON.stringify(body) }))
}

it('accepts nothing when no secret is set up, or the token is wrong', async () => {
  delete process.env.GUPSHUP_WEBHOOK_SECRET
  expect((await call('anything-at-all-123', { type: 'message' })).status).toBe(401)
  process.env.GUPSHUP_WEBHOOK_SECRET = 'a-secret-of-16-chars-or-more'
  expect((await call('wrong', { type: 'message' })).status).toBe(401)
  expect((await call(null, { type: 'message' })).status).toBe(401)
  expect(handle).not.toHaveBeenCalled()
})

it('hands the event over when the token matches, and answers 200 even if processing fails', async () => {
  process.env.GUPSHUP_WEBHOOK_SECRET = 'a-secret-of-16-chars-or-more'
  expect((await call('a-secret-of-16-chars-or-more', { type: 'message-event' })).status).toBe(200)
  expect(handle).toHaveBeenCalledTimes(1)
  handle.mockRejectedValueOnce(new Error('boom'))
  expect((await call('a-secret-of-16-chars-or-more', { type: 'message-event' })).status).toBe(200)
})
