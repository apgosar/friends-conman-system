import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'

const requireRole = vi.fn()
vi.mock('@/lib/guard', () => ({ requireRole: (p: string) => requireRole(p) }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { route, fail } from '@/lib/route'
import { apiError } from '@/lib/api-error'
import { ERROR_KINDS, kindForStatus } from '@/lib/errors'

const user = { id: 'u1', name: 'Asha', email: 'a@x.com', role: 'ADMIN' as const }
const req = (body?: unknown) => new NextRequest('http://localhost/api/x', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
const json = async (res: Response) => ({ status: res.status, body: await res.json() })

beforeEach(() => requireRole.mockResolvedValue({ user }))

describe('route()', () => {
  it('stops at the permission check without running the handler', async () => {
    requireRole.mockResolvedValue({ error: apiError('forbidden') })
    const handler = vi.fn()
    const res = await route('admin', handler)(req())
    expect(await json(res)).toEqual({ status: 403, body: { error: ERROR_KINDS.forbidden.message } })
    expect(handler).not.toHaveBeenCalled()
  })

  it('passes the awaited params, the user and a validated body', async () => {
    const res = await route<{ id: string }>('admin', async ({ params, user: u, body }) => {
      const { n } = await body(z.object({ n: z.number() }))
      return Response.json({ id: params.id, who: u.name, n })
    })(req({ n: 3 }), { params: Promise.resolve({ id: 'abc' }) })
    expect(await json(res)).toEqual({ status: 200, body: { id: 'abc', who: 'Asha', n: 3 } })
  })

  it('answers a bad body with 400, the first problem and the field details', async () => {
    const res = await route('admin', async ({ body }) => { await body(z.object({ n: z.number('Enter a number') })); return Response.json({}) })(req({ n: 'x' }))
    const { status, body } = await json(res)
    expect(status).toBe(400)
    expect(body.error).toBe('Enter a number')
    expect(body.details.fieldErrors).toHaveProperty('n')
  })

  it('maps thrown HttpError and domain errors that carry a status', async () => {
    const notFound = await route('admin', async () => { throw fail('notFound', 'Sale not found') })(req())
    expect(await json(notFound)).toEqual({ status: 404, body: { error: 'Sale not found' } })

    class SaleError extends Error { constructor(m: string, public status: number) { super(m) } }
    const conflict = await route('admin', async () => { throw new SaleError('This unit is already booked.', 409) })(req())
    expect(await json(conflict)).toEqual({ status: 409, body: { error: 'This unit is already booked' } }) // house style: no trailing full stop
  })

  it('never leaks the message of an unexpected error', async () => {
    const res = await route('admin', async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:5432') })(req())
    const { status, body } = await json(res)
    expect(status).toBe(500)
    expect(body).toEqual({ error: ERROR_KINDS.server.message })
  })
})

describe('error vocabulary', () => {
  it('maps statuses back to kinds', () => {
    expect(kindForStatus(404)).toBe('notFound')
    expect(kindForStatus(409)).toBe('conflict')
    expect(kindForStatus(418)).toBe('invalid')
    expect(kindForStatus(502)).toBe('server')
  })
})

describe('validation messages', () => {
  it('words a missing or wrong-typed field for a person', async () => {
    const { firstMessage } = await import('@/lib/validate')
    const schema = z.object({ scheduleId: z.string(), amount: z.number(), email: z.string().email('Enter a valid email address') })
    const msg = (input: unknown) => firstMessage(schema.safeParse(input).error!)
    expect(msg({})).toBe('Schedule id is required')
    expect(msg({ scheduleId: 'a', amount: 'x', email: 'a@b.co' })).toBe('Amount is not valid')
    expect(msg({ scheduleId: 'a', amount: 1, email: 'nope' })).toBe('Enter a valid email address')
  })
})
