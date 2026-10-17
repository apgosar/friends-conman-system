import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { describeDb, resetDb, getPrisma, seedUser } from './helpers/db'

let actor = { id: '', name: 'Root', email: 'root@example.com', role: 'SUPER_ADMIN' as const }
vi.mock('@/lib/guard', () => ({
  requireRole: async (permission: string) => (permission === 'superadmin' && actor.role !== 'SUPER_ADMIN' ? { error: Response.json({ error: 'Forbidden' }, { status: 403 }) } : { user: actor }),
}))

const req = (method: string, body: unknown) => new NextRequest('http://localhost/api/users', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

describeDb('users API rules', () => {
  beforeEach(async () => {
    await resetDb()
    const root = await seedUser('SUPER_ADMIN')
    actor = { ...actor, id: root.id }
  })

  it('refuses to demote or suspend yourself', async () => {
    const { PATCH } = await import('@/app/api/users/[id]/route')
    expect((await PATCH(req('PATCH', { role: 'ADMIN' }), ctx(actor.id))).status).toBe(409)
    expect((await PATCH(req('PATCH', { isActive: false }), ctx(actor.id))).status).toBe(409)
  })

  it('lets a Super Admin demote another Super Admin (they remain, so someone can still manage users)', async () => {
    const { PATCH } = await import('@/app/api/users/[id]/route')
    const other = await seedUser('SUPER_ADMIN')
    expect((await PATCH(req('PATCH', { role: 'ADMIN' }), ctx(other.id))).status).toBe(200)
  })

  it('role change and suspension end the person\'s open sessions (tokenVersion moves on)', async () => {
    const { PATCH } = await import('@/app/api/users/[id]/route')
    const prisma = await getPrisma()
    const u = await seedUser('ADMIN')
    await PATCH(req('PATCH', { role: 'VIEWER' }), ctx(u.id))
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).tokenVersion).toBe(1)
    await PATCH(req('PATCH', { name: 'Renamed' }), ctx(u.id)) // a rename alone does not sign anyone out
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).tokenVersion).toBe(1)
    await PATCH(req('PATCH', { isActive: false }), ctx(u.id))
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).tokenVersion).toBe(2)
  })

  it('creates users with a lower-cased email, a strong hash, and rejects duplicates in any case', async () => {
    const { POST } = await import('@/app/api/users/route')
    const prisma = await getPrisma()
    const ok = await POST(req('POST', { name: 'Neha Shah', email: 'Neha@Example.COM', role: 'SALES', password: 'Maple-River-77' }))
    expect(ok.status).toBe(201)
    const stored = await prisma.user.findFirstOrThrow({ where: { email: 'neha@example.com' } })
    expect(stored.password).toMatch(/^\$2[aby]\$12\$/)
    expect((await POST(req('POST', { name: 'Neha 2', email: 'NEHA@example.com', role: 'SALES', password: 'Maple-River-77' }))).status).toBe(409)
    expect((await POST(req('POST', { name: 'Weak', email: 'weak@example.com', role: 'SALES', password: 'password123' }))).status).toBe(400)
    expect((await POST(req('POST', { name: 'Bad Role', email: 'br@example.com', role: 'GOD', password: 'Maple-River-77' }))).status).toBe(400)
  })

  it('only a Super Admin may manage users', async () => {
    const { GET } = await import('@/app/api/users/route')
    actor = { ...actor, role: 'ADMIN' as unknown as 'SUPER_ADMIN' }
    expect((await GET()).status).toBe(403)
  })
})
