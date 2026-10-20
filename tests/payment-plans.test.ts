import { describe, expect, it } from 'vitest'
import {
  PaymentPlanSchema, comboLabel, missingCombos, plansFor, requiredCombos, saleTypesOfProject, schemeOf, unitTypeOfCategory,
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
