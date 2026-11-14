import { it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'

let role = 'ADMIN'
let actorId = 'u1'
const RANK: Record<string, string[]> = { ADMIN: ['viewer', 'staff', 'admin'], SALES: ['viewer', 'staff'] }
vi.mock('@/lib/guard', () => ({
  requireRole: async (min: string) => (RANK[role].includes(min) ? { user: { id: actorId, role } } : { error: new Response(JSON.stringify({ error: 'no' }), { status: 403 }) }),
}))

async function setup() {
  const prisma = await getPrisma()
  actorId = (await seedUser('ADMIN')).id
  const { project, units } = await seedProject({ units: 1 })
  const sale = await prisma.sale.create({ data: { saleNumber: 'S-1', projectId: project.id, unitId: units[0].id, agreementValue: 1000, gstAmount: 50, bookingDate: new Date(), status: 'BOOKED' } })
  const primary = await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Ashish', email: 'a@example.com', whatsappNumber: '9967542947', isPrimary: true, sequence: 1 } })
  const wife = await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Vaishali', email: 'a@example.com', whatsappNumber: '9967542947', sequence: 2 } })
  return { prisma, primary, wife }
}
const patch = async (id: string, body: unknown) => {
  const { PATCH } = await import('@/app/api/buyers/[id]/route')
  return PATCH(new NextRequest('http://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })
}

describeDb('turning a buyer\'s communication on or off', () => {
  beforeEach(async () => { await resetDb(); role = 'ADMIN' })

  it('turns it off for a co-buyer, and records it', async () => {
    const { prisma, wife } = await setup()
    expect((await patch(wife.id, { receiveComms: false })).status).toBe(200)
    expect((await prisma.buyer.findUniqueOrThrow({ where: { id: wife.id } })).receiveComms).toBe(false)
    expect(await prisma.auditLog.count({ where: { entityId: wife.id, action: 'updated' } })).toBe(1)
  })

  it('never for the primary buyer, and only for an administrator', async () => {
    const { prisma, primary, wife } = await setup()
    expect((await patch(primary.id, { receiveComms: false })).status).toBe(400)
    expect((await prisma.buyer.findUniqueOrThrow({ where: { id: primary.id } })).receiveComms).toBe(true)
    role = 'SALES'
    expect((await patch(wife.id, { receiveComms: false })).status).toBe(403)
  })
})
