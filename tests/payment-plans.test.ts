import { describe, expect, it } from 'vitest'
import {
  PaymentPlanSchema, comboKey, comboLabel, missingCombos, orderMilestones, plansFor, requiredCombos, saleTypesOfProject, schemeOf, unitTypeOfCategory,
} from '@/lib/payment-plans'

const plan = (over: Record<string, unknown> = {}) => ({
  name: '20/80', saleType: 'FRESH', unitType: 'RESIDENTIAL', isDefault: true,
  items: [{ name: 'Booking', percentOfAV: 20 }, { name: 'Possession', percentOfAV: 80 }],
  ...over,
})

describe('which plans a project needs', () => {
  it('maps unit categories to the plan unit types', () => {
    expect(unitTypeOfCategory('FLAT')).toBe('RESIDENTIAL')
    expect(unitTypeOfCategory('SHOP')).toBe('COMMERCIAL')
    expect(unitTypeOfCategory('OFFICE')).toBe('COMMERCIAL')
  })

  it('a project sells the sale types its type allows', () => {
    expect(saleTypesOfProject('FRESH')).toEqual(['FRESH'])
    expect(saleTypesOfProject('REDEVELOPMENT')).toEqual(['REDEVELOPMENT'])
    expect(saleTypesOfProject('MIXED')).toEqual(['FRESH', 'REDEVELOPMENT'])
  })

  it('needs commercial plans only when there are shops or offices', () => {
    expect(requiredCombos('FRESH', false).map(comboLabel)).toEqual(['New Sale · Residential'])
    expect(requiredCombos('MIXED', true).map(comboLabel)).toEqual([
      'New Sale · Residential', 'New Sale · Commercial', 'Rehab · Residential', 'Rehab · Commercial',
    ])
  })

  it('leaves out the combinations the project marked as not needed', () => {
    const notNeeded = [comboKey({ saleType: 'REDEVELOPMENT', unitType: 'COMMERCIAL' })]
    expect(requiredCombos('MIXED', true, notNeeded).map(comboLabel)).toEqual(['New Sale · Residential', 'New Sale · Commercial', 'Rehab · Residential'])
    expect(requiredCombos('MIXED', true, [])).toHaveLength(4)
  })

  it('lists the combinations that have no plan yet', () => {
    const have = [{ saleType: 'FRESH', unitType: 'RESIDENTIAL' }] as const
    expect(missingCombos([...have], requiredCombos('MIXED', true)).map(comboLabel)).toEqual([
      'New Sale · Commercial', 'Rehab · Residential', 'Rehab · Commercial',
    ])
    expect(missingCombos([...have], requiredCombos('FRESH', false))).toEqual([])
  })

  it('lists the plans of one combination with the default first', () => {
    const plans = [
      { id: '1', name: 'B scheme', saleType: 'FRESH', unitType: 'RESIDENTIAL', isDefault: false },
      { id: '2', name: 'C scheme', saleType: 'FRESH', unitType: 'RESIDENTIAL', isDefault: true },
      { id: '3', name: 'A scheme', saleType: 'FRESH', unitType: 'RESIDENTIAL', isDefault: false },
      { id: '4', name: 'Other', saleType: 'REDEVELOPMENT', unitType: 'RESIDENTIAL', isDefault: true },
    ] as const
    expect(plansFor([...plans], { saleType: 'FRESH', unitType: 'RESIDENTIAL' }).map((p) => p.name)).toEqual(['C scheme', 'A scheme', 'B scheme'])
  })

  it('writes a plan as its scheme', () => {
    expect(schemeOf([20, 30, 50])).toBe('20 / 30 / 50')
    expect(schemeOf([12.5, 87.5])).toBe('12.5 / 87.5')
  })
})

describe('PaymentPlanSchema', () => {
  const message = (input: unknown) => {
    const r = PaymentPlanSchema.safeParse(input)
    return r.success ? null : r.error.issues[0].message
  }

  it('accepts a plan that adds up to 100', () => {
    expect(PaymentPlanSchema.safeParse(plan()).success).toBe(true)
    expect(PaymentPlanSchema.safeParse(plan({ items: [{ name: 'A', percentOfAV: '20' }, { name: 'B', percentOfAV: '30' }, { name: 'C', percentOfAV: '50' }] })).success).toBe(true)
  })

  it('rejects a plan that does not add up to 100', () => {
    expect(message(plan({ items: [{ name: 'A', percentOfAV: 20 }, { name: 'B', percentOfAV: 70 }] }))).toMatch(/add up to 100/)
    expect(message(plan({ items: [{ name: 'A', percentOfAV: 60 }, { name: 'B', percentOfAV: 60 }] }))).toMatch(/add up to 100/)
  })

  it('rejects a missing name, an empty plan, a zero percentage and a repeated milestone', () => {
    expect(message(plan({ name: '  ' }))).toMatch(/plan name/)
    expect(message(plan({ items: [] }))).toMatch(/at least one milestone/)
    expect(message(plan({ items: [{ name: 'A', percentOfAV: 0 }, { name: 'B', percentOfAV: 100 }] }))).toMatch(/above 0/)
    expect(message(plan({ items: [{ name: 'A', percentOfAV: 50 }, { name: ' a ', percentOfAV: 50 }] }))).toMatch(/twice/)
    expect(message(plan({ items: [{ name: '', percentOfAV: 100 }] }))).toMatch(/milestone/)
  })

  it('rejects an unknown sale type or unit type', () => {
    expect(PaymentPlanSchema.safeParse(plan({ saleType: 'RESALE' })).success).toBe(false)
    expect(PaymentPlanSchema.safeParse(plan({ unitType: 'PARKING' })).success).toBe(false)
  })
})

describe('orderMilestones', () => {
  const ms = (names: string[]) => names.map((name, i) => ({ id: name, name, sequence: i + 1 }))
  const plan = (names: string[]) => ({ items: names.map((milestoneId, i) => ({ milestoneId, sequence: i + 1 })) })

  it('puts milestones one plan added later where they belong, not at the end', () => {
    // The residential plan came first; the commercial plan added 1st Slab, 2nd Slab and Commercial OC afterwards
    const milestones = ms(['Token', 'Plinth', '4th Slab', '6th Slab', '8th Slab', 'On Completion of OHT', 'Possession', '1st Slab', '2nd Slab', 'Commercial OC'])
    const residential = plan(['Token', 'Plinth', '4th Slab', '6th Slab', '8th Slab', 'On Completion of OHT', 'Possession'])
    const commercial = plan(['Token', 'Plinth', '1st Slab', '2nd Slab', 'Commercial OC', 'Possession'])
    expect(orderMilestones(milestones, [residential, commercial]).map((m) => m.name)).toEqual([
      'Token', 'Plinth', '1st Slab', '2nd Slab', '4th Slab', '6th Slab', '8th Slab', 'On Completion of OHT', 'Commercial OC', 'Possession',
    ])
  })

  it('keeps the order inside every plan', () => {
    const milestones = ms(['B', 'A', 'C'])
    const out = orderMilestones(milestones, [plan(['A', 'B']), plan(['B', 'C'])]).map((m) => m.name)
    expect(out.indexOf('A')).toBeLessThan(out.indexOf('B'))
    expect(out.indexOf('B')).toBeLessThan(out.indexOf('C'))
  })

  it('survives plans that contradict each other and keeps milestones that no plan uses', () => {
    const milestones = ms(['A', 'B', 'Loose'])
    const out = orderMilestones(milestones, [plan(['A', 'B']), plan(['B', 'A'])])
    expect(out).toHaveLength(3)
    expect(new Set(out.map((m) => m.name))).toEqual(new Set(['A', 'B', 'Loose']))
  })
})
