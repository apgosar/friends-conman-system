import { describe, it, expect } from 'vitest'
import { ChargeSchema, DEFAULT_OTHER_CHARGES, computeOtherCharges, rsText } from '@/lib/other-charges'

describe('computeOtherCharges', () => {
  it('gives the PAYABLES of your agreement: Rs. 7,88,600/- for an 830 sq ft flat', () => {
    const { items, total } = computeOtherCharges(DEFAULT_OTHER_CHARGES, { carpetAreaSqft: 830, commercial: false })
    expect(total).toBe(788_600)
    expect(items.map((i) => i.text)).toEqual([
      'Rs. 600/-', 'As Determined at the time of assessment', 'Rs. 1,00,000/-', 'Rs. 25,000/-', 'Rs. 25,000/-', 'Rs. 4,98,000/-', 'Rs. 25,000/-', 'Rs. 15,000/-', 'Rs. 1,00,000/-',
    ])
  })
  it('leaves the common area charge out (Nil) for a commercial unit', () => {
    const { items, total } = computeOtherCharges(DEFAULT_OTHER_CHARGES, { carpetAreaSqft: 830, commercial: true })
    expect(items[8]).toMatchObject({ amount: null, text: 'Nil' })
    expect(total).toBe(688_600)
  })
  it('a charge for commercial units only is Nil for a home', () => {
    const only = [{ name: 'Shop fit-out deposit', amountType: 'FIXED', amount: 50000, appliesTo: 'COMMERCIAL' }]
    expect(computeOtherCharges(only, { carpetAreaSqft: 500, commercial: false }).total).toBe(0)
    expect(computeOtherCharges(only, { carpetAreaSqft: 500, commercial: true }).total).toBe(50_000)
  })
  it('has nothing to add up with no charges', () => {
    expect(computeOtherCharges([], { carpetAreaSqft: 830, commercial: false })).toEqual({ items: [], total: 0 })
  })
})

describe('ChargeSchema', () => {
  const ok = { name: 'Legal charges', amountType: 'FIXED', amount: '15000', appliesTo: 'BOTH' }
  it('needs a name, and an amount unless it is to be determined', () => {
    expect(ChargeSchema.parse(ok).amount).toBe(15000)
    expect(ChargeSchema.safeParse({ ...ok, name: ' ' }).success).toBe(false)
    expect(ChargeSchema.safeParse({ ...ok, amount: '0' }).success).toBe(false)
    expect(ChargeSchema.safeParse({ ...ok, amountType: 'AS_DETERMINED', amount: 0 }).success).toBe(true)
    expect(ChargeSchema.safeParse({ ...ok, amount: '-5' }).success).toBe(false)
  })
  it('prints an amount the way the agreement does', () => {
    expect(rsText(788600)).toBe('Rs. 7,88,600/-')
  })
})
