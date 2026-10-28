import { it, expect, beforeEach, vi } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'

// The route is called with the signed-in user as the guard returns it
const asRole = (role: string, id = 'u1') => vi.doMock('@/lib/guard', () => ({
  requireRole: async (min: string) => (role === 'SUPER_ADMIN' || min !== 'superadmin' ? { user: { id, role } } : { error: new Response(JSON.stringify({ error: 'no' }), { status: 403 }) }),
}))

async function setup() {
  const prisma = await getPrisma()
  const user = await seedUser('SUPER_ADMIN')
  const { project, units } = await seedProject({ name: 'Neev Heights', units: 1 })
  const milestone = await prisma.constructionMilestone.create({
    data: { projectId: project.id, name: 'Plinth', sequence: 1, status: 'COMPLETED', actualDate: new Date(), architectCertificateUrl: '/api/files/cert.pdf' },
  })
  const sale = await prisma.sale.create({
    data: { saleNumber: 'NH-001', projectId: project.id, unitId: units[0].id, agreementValue: 1_000_000, gstAmount: 50_000, bookingDate: new Date(), status: 'IN_PROGRESS', agreementDate: new Date() },
  })
  const schedule = await prisma.paymentSchedule.create({
    data: { saleId: sale.id, milestoneId: milestone.id, description: 'Plinth', principalAmount: 100_000, gstAmount: 5_000, status: 'DUE', demandGeneratedDate: new Date(), dueDate: new Date() },
  })
  return { prisma, user, milestone, sale, schedule }
}

const call = async (id: string) => {
  const { POST } = await import('@/app/api/milestones/[id]/uncomplete/route')
  return (await POST(new Request('http://x') as never, { params: Promise.resolve({ id }) })) as Response
}

describeDb('taking a milestone back from Completed', () => {
  beforeEach(async () => { await resetDb(); vi.resetModules() })

  it('puts the milestone and its demands back, and clears the certificate', async () => {
    const { prisma, user, milestone, schedule } = await setup()
    asRole('SUPER_ADMIN', user.id)
    const res = await call(milestone.id)
    expect(res.status).toBe(200)
    expect(await prisma.constructionMilestone.findUniqueOrThrow({ where: { id: milestone.id } })).toMatchObject({ status: 'UPCOMING', actualDate: null, architectCertificateUrl: null })
    expect(await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).toMatchObject({ status: 'UPCOMING', dueDate: null, demandGeneratedDate: null })
    expect((await prisma.auditLog.findMany({ where: { entityId: milestone.id, action: 'uncompleted' } })).length).toBe(1)
  })

  it('is refused once a payment has been recorded against one of its demands', async () => {
    const { prisma, user, milestone, sale, schedule } = await setup()
    asRole('SUPER_ADMIN', user.id)
    await prisma.payment.create({ data: { scheduleId: schedule.id, saleId: sale.id, amount: 10, mode: 'CASH', paymentDate: new Date(), receiptNumber: 'RCP-1' } })
    expect((await call(milestone.id)).status).toBe(400)
    expect((await prisma.constructionMilestone.findUniqueOrThrow({ where: { id: milestone.id } })).status).toBe('COMPLETED')
  })

  it('is for a Super Admin only', async () => {
    asRole('ADMIN')
    const { prisma, milestone } = await setup()
    expect((await call(milestone.id)).status).toBe(403)
    expect((await prisma.constructionMilestone.findUniqueOrThrow({ where: { id: milestone.id } })).status).toBe('COMPLETED')
  })

  it('says so when the milestone is not complete', async () => {
    const { prisma, user, milestone } = await setup()
    asRole('SUPER_ADMIN', user.id)
    await prisma.constructionMilestone.update({ where: { id: milestone.id }, data: { status: 'UPCOMING' } })
    expect((await call(milestone.id)).status).toBe(409)
  })
})
