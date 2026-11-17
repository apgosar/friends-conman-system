import { describe, it, expect } from 'vitest'
import { dueDateAfter, DEMAND_DUE_DAYS, BOOKING_DUE_DAYS } from '@/lib/payment-plans'
import { parsePricingSettings } from '@/lib/pricing-settings'

describe('the days a demand has to be paid', () => {
  it('starts every project at the days that were fixed before', () => {
    expect([DEMAND_DUE_DAYS, BOOKING_DUE_DAYS]).toEqual([14, 15])
  })
  it('counts the due date from the day the demand was raised, over a month end, without changing that day', () => {
    const raised = new Date(2026, 0, 25)
    expect(dueDateAfter(raised, 14)).toEqual(new Date(2026, 1, 8))
    expect(dueDateAfter(raised, 0)).toEqual(raised)
    expect(raised).toEqual(new Date(2026, 0, 25))
  })
  it('accepts whole days from a form, and rejects the rest', () => {
    expect(parsePricingSettings({ demandDueDays: '30', bookingDueDays: 7 }).data).toEqual({ demandDueDays: 30, bookingDueDays: 7 })
    expect(parsePricingSettings({ demandDueDays: '' }).error).toMatch(/Days to pay a demand is required/)
    expect(parsePricingSettings({ demandDueDays: 2.5 }).error).toMatch(/whole number/)
    expect(parsePricingSettings({ bookingDueDays: -1 }).error).toMatch(/cannot be negative/)
    expect(parsePricingSettings({ bookingDueDays: 400 }).error).toMatch(/cannot be more than 365/)
  })
})
