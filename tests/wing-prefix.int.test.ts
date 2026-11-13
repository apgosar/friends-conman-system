import { it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'

let role = 'SUPER_ADMIN'
let actorId = 'u1'
vi.mock('@/lib/guard', () => ({
  requireRole: async (min: string) => (min !== 'superadmin' || role === 'SUPER_ADMIN' ? { user: { id: actorId, role } } : { error: new Response(JSON.stringify({ error: 'no' }), { status: 403 }) }),
}))

/** A single-wing project (wing A) whose flats were set up as A-G01, A-101, A-102, plus a shop in the Commercial block. */
async function setup() {
  const prisma = await getPrisma()
  actorId = (await seedUser('SUPER_ADMIN')).id
  const { project, wing, floor, units } = await seedProject({ units: 3 })
  await Promise.all(['A-G01', 'A-101', 'A-102'].map((unitNumber, i) => prisma.unit.update({ where: { id: units[i].id }, data: { unitNumber } })))
  const commercial = await prisma.wing.create({ data: { projectId: project.id, name: 'Commercial', totalFloors: 1 } })
  const shopFloor = await prisma.floor.create({ data: { wingId: commercial.id, floorNumber: 0 } })
  await prisma.unit.create({ data: { floorId: shopFloor.id, unitNumber: 'SHOP NO 1', configuration: 'Shop', carpetAreaSqft: 300, category: 'SHOP' } })
  return { prisma, project, wing, floor, units }
}

const call = async (projectId: string, wingId: string) => {
  const { POST } = await import('@/app/api/projects/[id]/wings/[wingId]/drop-prefix/route')
  return POST(new NextRequest('http://x', { method: 'POST' }), { params: Promise.resolve({ id: projectId, wingId }) })
}
const numbers = async (prisma: Awaited<ReturnType<typeof getPrisma>>, projectId: string) =>
  (await prisma.unit.findMany({ where: { floor: { wing: { projectId } } }, select: { unitNumber: true } })).map((u) => u.unitNumber).sort()

describeDb('removing the wing prefix of a single-wing project', () => {
  beforeEach(async () => { await resetDb(); role = 'SUPER_ADMIN' })

  it('renumbers every flat of the wing, leaves the shops alone, and is recorded', async () => {
    const { prisma, project, wing } = await setup()
    const res = await call(project.id, wing.id)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ renamed: 3 })
    expect(await numbers(prisma, project.id)).toEqual(['101', '102', 'G01', 'SHOP NO 1'])
    expect(await prisma.auditLog.count({ where: { entityId: wing.id, action: 'unit_prefix_removed' } })).toBe(1)
    expect((await call(project.id, wing.id)).status).toBe(400) // nothing left to remove
  })

  it('is refused when the project has a second wing, the prefix keeping their numbers apart', async () => {
    const { prisma, project, wing } = await setup()
    await prisma.wing.create({ data: { projectId: project.id, name: 'B', totalFloors: 1 } })
    expect((await call(project.id, wing.id)).status).toBe(409)
    expect(await numbers(prisma, project.id)).toContain('A-101')
  })

  it('changes nothing when a flat has a sale, or a new number is already taken', async () => {
    const { prisma, project, wing, units } = await setup()
    const sale = await prisma.sale.create({ data: { saleNumber: 'S-1', projectId: project.id, unitId: units[1].id, agreementValue: 1000, gstAmount: 50, bookingDate: new Date(), status: 'BOOKED' } })
    const sold = await call(project.id, wing.id)
    expect(sold.status).toBe(409)
    expect((await sold.json()).error).toMatch(/A-101.*locked/)

    await prisma.sale.update({ where: { id: sale.id }, data: { status: 'CANCELLED', deletedAt: new Date() } })
    await prisma.unit.update({ where: { id: units[2].id }, data: { unitNumber: '101' } }) // someone already named a flat 101
    const clash = await call(project.id, wing.id)
    expect(clash.status).toBe(409)
    expect((await clash.json()).error).toMatch(/used twice: 101/)
    expect(await numbers(prisma, project.id)).toEqual(['101', 'A-101', 'A-G01', 'SHOP NO 1'])
  })

  it('is for a Super Admin only', async () => {
    const { project, wing } = await setup()
    role = 'ADMIN'
    expect((await call(project.id, wing.id)).status).toBe(403)
  })
})
