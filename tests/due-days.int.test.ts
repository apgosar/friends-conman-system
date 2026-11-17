import { it, expect, beforeEach, vi } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'

vi.mock('@/lib/guard', () => ({ requireRole: async () => ({ user: { id: 'u1', role: 'ADMIN' } }) }))
vi.mock('@/lib/comms-dispatcher', () => ({ dispatchAllPending: async () => undefined }))

describeDb('a demand falls due the number of days the project sets', () => {
  beforeEach(async () => { await resetDb() })

  it('after a milestone is completed, uses the project days', async () => {
    const prisma = await getPrisma()
    await seedUser('ADMIN')
    const { project, units } = await seedProject({ units: 1 })
    await prisma.project.update({ where: { id: project.id }, data: { demandDueDays: 30 } })
    const milestone = await prisma.constructionMilestone.create({ data: { projectId: project.id, name: 'Plinth', sequence: 1 } })
    const sale = await prisma.sale.create({ data: { saleNumber: 'S-1', projectId: project.id, unitId: units[0].id, agreementValue: 1_000_000, gstAmount: 50_000, bookingDate: new Date(), status: 'IN_PROGRESS' } })
    const schedule = await prisma.paymentSchedule.create({ data: { saleId: sale.id, milestoneId: milestone.id, description: 'Plinth', principalAmount: 100_000, gstAmount: 5_000, status: 'UPCOMING' } })
    const { POST } = await import('@/app/api/milestones/[id]/complete/route')
    const res = await POST(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ architectCertificateUrl: '/api/files/c.pdf' }) }) as never, { params: Promise.resolve({ id: milestone.id }) })
    expect(res.status).toBe(200)
    const done = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: schedule.id } })
    const days = Math.round((done.dueDate!.getTime() - done.demandGeneratedDate!.getTime()) / 86_400_000)
    expect(days).toBe(30)
  })
})
