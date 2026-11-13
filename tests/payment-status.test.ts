import { describe, it, expect } from 'vitest'
import { statusAfterPayment } from '@/lib/status'

describe('statusAfterPayment', () => {
  it('is Paid once everything is cleared, whatever it was', () => {
    for (const s of ['UPCOMING', 'DUE', 'PARTIALLY_PAID', 'OVERDUE_30PLUS']) expect(statusAfterPayment(s, true)).toBe('PAID')
  })
  it('leaves an advance on a demand not yet raised Upcoming, and an overdue demand in its bucket', () => {
    expect(statusAfterPayment('UPCOMING', false)).toBe('UPCOMING')
    expect(statusAfterPayment('OVERDUE_15', false)).toBe('OVERDUE_15')
  })
  it('makes a raised demand Partially Paid', () => {
    expect(statusAfterPayment('DUE', false)).toBe('PARTIALLY_PAID')
    expect(statusAfterPayment('PARTIALLY_PAID', false)).toBe('PARTIALLY_PAID')
  })
})
