import { beforeEach, expect, it } from 'vitest'
import { describeDb, getPrisma, resetDb, seedProject } from './helpers/db'
import type { PaymentPlanInput } from '@/lib/payment-plans'

const input = (over: Partial<PaymentPlanInput> = {}): PaymentPlanInput => ({
  name: '20/80', saleType: 'FRESH', unitType: 'RESIDENTIAL', isDefault: false,
  items: [{ name: 'Booking', percentOfAV: 20 }, { name: 'Possession', percentOfAV: 80 }],
  ...over,
})

describeDb('payment plan store', () => {
  beforeEach(resetDb)

  async function setup() {
    const prisma = await getPrisma()
    const { savePaymentPlan, deletePaymentPlan } = await import('@/lib/payment-plan-store')
    const { transaction } = await import('@/lib/db')
    const { project } = await seedProject({ units: 1 })
    const save = (planId: string | null, data: PaymentPlanInput) => transaction((tx) => savePaymentPlan(tx, project.id, planId, data))
    const remove = (planId: string) => transaction((tx) => deletePaymentPlan(tx, project.id, planId))
    const plans = () => prisma.paymentPlan.findMany({ where: { projectId: project.id }, orderBy: { name: 'asc' } })
    return { prisma, project, save, remove, plans }
  }

  it('makes the first plan for a sale type and unit type the default, whatever was asked', async () => {
    const { save, plans } = await setup()
    await save(null, input({ isDefault: false }))
    expect((await plans())[0].isDefault).toBe(true)
  })

  it('moves the default when another plan is made the default', async () => {
    const { save, plans } = await setup()
    await save(null, input({ name: 'A' }))
    await save(null, input({ name: 'B', isDefault: true }))
    expect((await plans()).map((p) => [p.name, p.isDefault])).toEqual([['A', false], ['B', true]])
  })

  it('keeps defaults separate for each sale type and unit type', async () => {
    const { save, plans } = await setup()
    await save(null, input({ name: 'A' }))
    await save(null, input({ name: 'B', unitType: 'COMMERCIAL' }))
    await save(null, input({ name: 'C', saleType: 'REDEVELOPMENT' }))
    expect((await plans()).every((p) => p.isDefault)).toBe(true)
  })

  it('will not switch the default off without choosing another', async () => {
    const { save, plans } = await setup()
    const a = await save(null, input({ name: 'A' }))
    await save(null, input({ name: 'B' }))
    await expect(save(a, input({ name: 'A', isDefault: false }))).rejects.toThrow(/another plan the default/)
    expect((await plans()).filter((p) => p.isDefault).map((p) => p.name)).toEqual(['A'])
  })

  it('promotes another plan when the default is deleted', async () => {
    const { save, remove, plans } = await setup()
    const a = await save(null, input({ name: 'A' }))
    await save(null, input({ name: 'B' }))
    await remove(a)
    expect((await plans()).map((p) => [p.name, p.isDefault])).toEqual([['B', true]])
  })

  it('promotes a default in the old combination when a plan moves out of it', async () => {
    const { save, plans } = await setup()
    const a = await save(null, input({ name: 'A' }))
    await save(null, input({ name: 'B' }))
    await save(a, input({ name: 'A', unitType: 'COMMERCIAL' }))
    const all = await plans()
    expect(all.find((p) => p.name === 'A')).toMatchObject({ unitType: 'COMMERCIAL', isDefault: true })
    expect(all.find((p) => p.name === 'B')).toMatchObject({ unitType: 'RESIDENTIAL', isDefault: true })
  })

  it('rejects a second plan with the same name for the same combination, ignoring case', async () => {
    const { save } = await setup()
    await save(null, input({ name: 'Scheme' }))
    await expect(save(null, input({ name: 'scheme' }))).rejects.toThrow(/already a plan called/)
  })

  it('adds the milestones a plan names to the project once, reusing existing ones', async () => {
    const { prisma, project, save } = await setup()
    await save(null, input({ name: 'A', items: [{ name: 'Booking', percentOfAV: 20 }, { name: 'Plinth', percentOfAV: 80 }] }))
    await save(null, input({ name: 'B', items: [{ name: 'booking', percentOfAV: 10 }, { name: 'Possession', percentOfAV: 90 }] }))
    const milestones = await prisma.constructionMilestone.findMany({ where: { projectId: project.id }, orderBy: { sequence: 'asc' } })
    expect(milestones.map((m) => m.name)).toEqual(['Booking', 'Plinth', 'Possession'])
    expect(milestones.map((m) => m.sequence)).toEqual([1, 2, 3])
  })

  it('keeps the milestones of the project in the order the plans imply when a later plan adds some', async () => {
    const { prisma, project, save } = await setup()
    await save(null, input({ name: 'Residential', items: [{ name: 'Token', percentOfAV: 10 }, { name: 'Plinth', percentOfAV: 30 }, { name: '4th Slab', percentOfAV: 30 }, { name: 'Possession', percentOfAV: 30 }] }))
    await save(null, input({ name: 'Commercial', unitType: 'COMMERCIAL', items: [{ name: 'Token', percentOfAV: 10 }, { name: 'Plinth', percentOfAV: 30 }, { name: '1st Slab', percentOfAV: 30 }, { name: 'Possession', percentOfAV: 30 }] }))
    const milestones = await prisma.constructionMilestone.findMany({ where: { projectId: project.id }, orderBy: { sequence: 'asc' } })
    expect(milestones.map((m) => m.name)).toEqual(['Token', 'Plinth', '1st Slab', '4th Slab', 'Possession'])
  })

  it('keeps a milestone order set by hand until the automatic order is chosen again', async () => {
    const { prisma, project, save } = await setup()
    const { setMilestoneOrder, setAutomaticMilestoneOrder } = await import('@/lib/payment-plan-store')
    const { transaction } = await import('@/lib/db')
    await save(null, input({ name: 'Res', items: [{ name: 'Token', percentOfAV: 10 }, { name: 'Plinth', percentOfAV: 30 }, { name: 'Possession', percentOfAV: 60 }] }))
    const names = async () => (await prisma.constructionMilestone.findMany({ where: { projectId: project.id }, orderBy: { sequence: 'asc' } })).map((m) => m.name)
    const byName = async () => Object.fromEntries((await prisma.constructionMilestone.findMany({ where: { projectId: project.id } })).map((m) => [m.name, m.id]))

    const ids = await byName()
    await transaction((tx) => setMilestoneOrder(tx, project.id, [ids.Possession, ids.Plinth, ids.Token]))
    expect(await names()).toEqual(['Possession', 'Plinth', 'Token'])

    // a plan change does not re-sort it; a new milestone goes to the end
    await save(null, input({ name: 'Com', unitType: 'COMMERCIAL', items: [{ name: 'Token', percentOfAV: 10 }, { name: '1st Slab', percentOfAV: 30 }, { name: 'Possession', percentOfAV: 60 }] }))
    expect(await names()).toEqual(['Possession', 'Plinth', 'Token', '1st Slab'])

    await transaction((tx) => setAutomaticMilestoneOrder(tx, project.id))
    expect(await names()).toEqual(['Token', 'Plinth', '1st Slab', 'Possession'])
  })

  it('refuses a manual order that is not exactly the project milestones', async () => {
    const { prisma, project, save } = await setup()
    const { setMilestoneOrder } = await import('@/lib/payment-plan-store')
    const { transaction } = await import('@/lib/db')
    await save(null, input({}))
    const ms = await prisma.constructionMilestone.findMany({ where: { projectId: project.id } })
    await expect(transaction((tx) => setMilestoneOrder(tx, project.id, [ms[0].id]))).rejects.toThrow(/does not match/)
    await expect(transaction((tx) => setMilestoneOrder(tx, project.id, [ms[0].id, ms[0].id]))).rejects.toThrow(/does not match/)
    await expect(transaction((tx) => setMilestoneOrder(tx, project.id, [ms[0].id, 'nope']))).rejects.toThrow(/does not match/)
  })

  it('records a combination as not needed, but not while it has plans', async () => {
    const { prisma, project, save } = await setup()
    const { setComboNeeded } = await import('@/lib/payment-plan-store')
    const { transaction } = await import('@/lib/db')
    const combo = { saleType: 'REDEVELOPMENT', unitType: 'COMMERCIAL' } as const
    await transaction((tx) => setComboNeeded(tx, project.id, combo, false))
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).paymentPlanOptOuts).toEqual(['REDEVELOPMENT:COMMERCIAL'])
    await transaction((tx) => setComboNeeded(tx, project.id, combo, true))
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).paymentPlanOptOuts).toEqual([])
    await save(null, input({ ...combo }))
    await expect(transaction((tx) => setComboNeeded(tx, project.id, combo, false))).rejects.toThrow(/Delete the payment plans/)
  })

  it('does not let a second default exist (the unique index is the last line of defence)', async () => {
    const { prisma, project, save } = await setup()
    await save(null, input({ name: 'A' }))
    const b = await save(null, input({ name: 'B' }))
    await expect(prisma.paymentPlan.update({ where: { id: b }, data: { isDefault: true } })).rejects.toThrow()
    expect(await prisma.paymentPlan.count({ where: { projectId: project.id, isDefault: true } })).toBe(1)
  })
})
