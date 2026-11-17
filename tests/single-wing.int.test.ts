import { it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'

let role = 'SUPER_ADMIN'
let actorId = 'u1'
vi.mock('@/lib/guard', () => ({
  requireRole: async (min: string) => (min !== 'superadmin' || role === 'SUPER_ADMIN' ? { user: { id: actorId, role } } : { error: new Response(JSON.stringify({ error: 'no' }), { status: 403 }) }),
}))

async function setup() {
  const prisma = await getPrisma()
  actorId = (await seedUser('SUPER_ADMIN')).id
  const { project } = await seedProject({ units: 0 })
  const type = await prisma.unitType.create({ data: { projectId: project.id, name: '2 BHK', category: 'FLAT', configuration: '2 BHK', carpetAreaSqft: 700 } })
  return { prisma, project, type }
}
const generate = async (projectId: string, body: unknown) => {
  const { POST } = await import('@/app/api/projects/[id]/structure/generate/route')
  return POST(new NextRequest('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: projectId }) })
}
const mode = async (projectId: string, singleWing: boolean) => {
  const { PUT } = await import('@/app/api/projects/[id]/structure/mode/route')
  return PUT(new NextRequest('http://x', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ singleWing }) }), { params: Promise.resolve({ id: projectId }) })
}
const wing = (name: string, typeId: string) => ({ name, patterns: [{ from: 1, to: 2, unitTypeIds: [typeId] }] })

describeDb('single-wing projects', () => {
  beforeEach(async () => { await resetDb(); role = 'SUPER_ADMIN' })

  it('builds one building, numbered without a wing prefix, and remembers it has no wings', async () => {
    const { prisma, project, type } = await setup()
    const res = await generate(project.id, { numbering: 'FNN', singleWing: true, wings: [wing('A', type.id)] })
    expect(res.status).toBe(201)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).singleWing).toBe(true)
    const numbers = (await prisma.unit.findMany({ where: { floor: { wing: { projectId: project.id } } }, select: { unitNumber: true } })).map((u) => u.unitNumber).sort()
    expect(numbers).toEqual(['101', '201'])
  })

  it('refuses a second wing, and a wing prefix, in a single-wing project', async () => {
    const { project, type } = await setup()
    expect((await generate(project.id, { numbering: 'FNN', singleWing: true, wings: [wing('A', type.id), wing('B', type.id)] })).status).toBe(400)
    expect((await generate(project.id, { numbering: 'W-FNN', singleWing: true, wings: [wing('A', type.id)] })).status).toBe(400)
    await generate(project.id, { numbering: 'FNN', singleWing: true, wings: [wing('A', type.id)] })
    expect((await generate(project.id, { numbering: 'FNN', wings: [wing('B', type.id)] })).status).toBe(400) // the project's own setting still applies
  })

  it('can be switched to several wings and back, only while it has one wing', async () => {
    const { prisma, project, type } = await setup()
    await generate(project.id, { numbering: 'FNN', singleWing: true, wings: [wing('A', type.id)] })
    expect((await mode(project.id, false)).status).toBe(200)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).singleWing).toBe(false)
    expect((await generate(project.id, { numbering: 'W-FNN', wings: [wing('B', type.id)] })).status).toBe(201)
    expect((await mode(project.id, true)).status).toBe(400) // two wings now
    role = 'ADMIN'
    expect((await mode(project.id, false)).status).toBe(403)
  })
})
