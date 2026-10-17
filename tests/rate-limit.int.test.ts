import { describe, it, expect, beforeEach } from 'vitest'
import { describeDb, resetDb } from './helpers/db'
import { clientIp } from '@/lib/rate-limit'

const headers = (h: Record<string, string>) => ({ headers: new Headers(h) })

describe('clientIp', () => {
  it('counts from the right, so a client-supplied X-Forwarded-For cannot pick its own address', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 9.9.9.9' }), 1)).toBe('9.9.9.9')
    expect(clientIp(headers({ 'x-forwarded-for': '6.6.6.6, 9.9.9.9' }), 1)).toBe('9.9.9.9')
    expect(clientIp(headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 9.9.9.9' }), 2)).toBe('2.2.2.2')
  })
  it('handles a single entry, no header, x-real-ip and nonsense counts', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '9.9.9.9' }), 1)).toBe('9.9.9.9')
    expect(clientIp(headers({ 'x-forwarded-for': '9.9.9.9' }), 5)).toBe('9.9.9.9')
    expect(clientIp(headers({ 'x-real-ip': '8.8.8.8' }), 1)).toBe('8.8.8.8')
    expect(clientIp(headers({}), 1)).toBe('unknown')
    expect(clientIp(headers({ 'x-forwarded-for': '9.9.9.9' }), 0)).toBe('9.9.9.9')
  })
})

describeDb('database-backed rate limit', () => {
  beforeEach(resetDb)

  it('allows up to the limit then blocks, per key', async () => {
    const { hit } = await import('@/lib/rate-limit')
    const outcomes = []
    for (let i = 0; i < 5; i++) outcomes.push((await hit('t:a', 3, 60_000)).ok)
    expect(outcomes).toEqual([true, true, true, false, false])
    expect((await hit('t:b', 3, 60_000)).ok).toBe(true)
  })

  it('reports remaining and a reset time in the future', async () => {
    const { hit } = await import('@/lib/rate-limit')
    const r = await hit('t:c', 3, 60_000)
    expect(r.remaining).toBe(2)
    expect(r.reset).toBeGreaterThan(Date.now() + 50_000)
    expect(r.reset).toBeLessThan(Date.now() + 70_000)
  })

  it('is exact under concurrency (this is what made the in-memory version unsafe across instances)', async () => {
    const { hit } = await import('@/lib/rate-limit')
    const results = await Promise.all(Array.from({ length: 30 }, () => hit('t:d', 10, 60_000)))
    expect(results.filter((r) => r.ok)).toHaveLength(10)
  })

  it('starts a fresh window once the old one has expired', async () => {
    const { hit } = await import('@/lib/rate-limit')
    expect((await hit('t:e', 1, 300)).ok).toBe(true)
    expect((await hit('t:e', 1, 300)).ok).toBe(false)
    await new Promise((r) => setTimeout(r, 450))
    expect((await hit('t:e', 1, 300)).ok).toBe(true)
  })

  it('peek does not count, and clearBucket resets', async () => {
    const { hit, peek, clearBucket } = await import('@/lib/rate-limit')
    expect(await peek('t:f')).toBeNull()
    await hit('t:f', 5, 60_000); await hit('t:f', 5, 60_000)
    expect((await peek('t:f'))?.count).toBe(2)
    expect((await peek('t:f'))?.count).toBe(2)
    await clearBucket('t:f')
    expect(await peek('t:f')).toBeNull()
  })

  it('rateLimit() keys on the user when given, so two users behind one office IP do not share a bucket', async () => {
    const { rateLimit } = await import('@/lib/rate-limit')
    const req = headers({ 'x-forwarded-for': '9.9.9.9' })
    expect((await rateLimit(req, { limit: 1, windowMs: 60_000, prefix: 'p', key: 'user-1' })).ok).toBe(true)
    expect((await rateLimit(req, { limit: 1, windowMs: 60_000, prefix: 'p', key: 'user-2' })).ok).toBe(true)
    expect((await rateLimit(req, { limit: 1, windowMs: 60_000, prefix: 'p', key: 'user-1' })).ok).toBe(false)
    expect((await rateLimit(req, { limit: 1, windowMs: 60_000, prefix: 'p' })).ok).toBe(true) // falls back to IP
    expect((await rateLimit(req, { limit: 1, windowMs: 60_000, prefix: 'p' })).ok).toBe(false)
  })
})
