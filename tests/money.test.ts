import { describe, it, expect } from 'vitest'
import { toPaise, fromPaise, round2, sumRupees, percentOf } from '@/lib/money'

describe('money', () => {
  it('does not drift like floats', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(sumRupees([0.1, 0.2])).toBe(0.3)
    expect(sumRupees(Array(10).fill(0.1))).toBe(1)
  })
  it('converts both ways', () => {
    expect(toPaise(1234.56)).toBe(123456)
    expect(toPaise('19.99')).toBe(1999)
    expect(toPaise(null)).toBe(0)
    expect(fromPaise(123456)).toBe(1234.56)
  })
  it('rounds to 2dp', () => {
    expect(round2(10.005)).toBe(10.01)
    expect(round2(1.234)).toBe(1.23)
  })
  it('takes a percentage', () => {
    expect(percentOf(10_000_000, 5)).toBe(500_000)
    expect(percentOf(333.33, 5)).toBe(16.67)
  })
})
