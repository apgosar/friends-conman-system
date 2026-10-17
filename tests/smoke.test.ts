import { describe, it, expect } from 'vitest'
import { deriveSaleStatus } from '@/lib/sale-lifecycle'

describe('test harness', () => {
  it('runs TypeScript with the @ alias', () => {
    expect(deriveSaleStatus({ agreementDate: null, possessionDate: null, paymentSchedules: [] })).toBe('BOOKED')
  })
})
