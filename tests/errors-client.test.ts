import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchJson, ApiError, errorMessage, jsonRequest } from '@/lib/client/api'
import { apiError } from '@/lib/api-error'
import { plural } from '@/lib/errors'

const respond = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))
afterEach(() => vi.unstubAllGlobals())

describe('fetchJson', () => {
  it('returns the parsed body on success', async () => {
    respond(200, { success: true, data: 1 })
    expect(await fetchJson('/x')).toEqual({ success: true, data: 1 })
  })
  it('throws the server message on failure', async () => {
    respond(409, { error: 'This unit is no longer available' })
    await expect(fetchJson('/x')).rejects.toMatchObject({ message: 'This unit is no longer available', status: 409 })
  })
  it('falls back to the standard wording when the body has no message', async () => {
    respond(403, {})
    await expect(fetchJson('/x')).rejects.toMatchObject({ message: 'You do not have permission to do this' })
    respond(500, 'not json')
    await expect(fetchJson('/x')).rejects.toMatchObject({ message: 'Something went wrong on our side. Please try again' })
  })
  it('turns a network failure into a readable message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(fetchJson('/x')).rejects.toMatchObject({ message: expect.stringContaining('Could not reach the server'), status: 0 })
  })
  it('exposes field errors from validation failures', async () => {
    respond(400, { error: 'Enter a valid email address', details: { fieldErrors: { email: ['Enter a valid email address'] } } })
    const err = await fetchJson('/x').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.fieldErrors).toEqual({ email: ['Enter a valid email address'] })
  })
  it('errorMessage handles anything thrown', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('string')).toBe('Something went wrong on our side. Please try again')
  })
  it('jsonRequest sets the headers', () => {
    expect(jsonRequest('POST', { a: 1 })).toEqual({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' })
  })
})

describe('apiError', () => {
  it('uses the catalogue status and wording, or a custom message', async () => {
    const r = apiError('forbidden')
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ error: 'You do not have permission to do this' })
    const c = apiError('conflict', 'This unit is already booked')
    expect(c.status).toBe(409)
    expect((await c.json()).error).toBe('This unit is already booked')
  })
})

describe('plural', () => {
  it('replaces "unit(s)"', () => {
    expect(plural(1, 'unit')).toBe('1 unit')
    expect(plural(3, 'unit')).toBe('3 units')
    expect(plural(2, 'inquiry', 'inquiries')).toBe('2 inquiries')
  })
})
