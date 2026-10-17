import { describe, it, expect } from 'vitest'
import { computeCharges, DEFAULT_PRICING, pricingFromProject, gstOn } from '@/lib/pricing'
import { projectPrefix } from '@/lib/numbering'

describe('pricing', () => {
  it('reproduces the figures the sale form used to hard-code (6% stamp duty, 1% capped at 30,000, +20,000 with parking)', () => {
    const c = computeCharges(DEFAULT_PRICING, 10_000_000, false)
    expect(c).toEqual({ gst: 500_000, stampDuty: 600_000, registration: 30_000 })
    expect(computeCharges(DEFAULT_PRICING, 10_000_000, true).registration).toBe(50_000)
  })
  it('does not charge more than 1% on a small agreement', () => {
    expect(computeCharges(DEFAULT_PRICING, 2_000_000, false).registration).toBe(20_000)
  })
  it('honours per-project settings, including no cap', () => {
    const cfg = pricingFromProject({ gstRatePercent: 12, stampDutyPercent: 7, regChargesPercent: 1, regChargesCap: null, regParkingCharges: 0 })
    expect(computeCharges(cfg, 10_000_000, true)).toEqual({ gst: 1_200_000, stampDuty: 700_000, registration: 100_000 })
    expect(gstOn(cfg, 250_000)).toBe(30_000)
  })
  it('falls back to defaults for missing settings', () => {
    expect(pricingFromProject({})).toEqual(DEFAULT_PRICING)
  })
})

describe('project prefix', () => {
  it.each([['Green Heights', 'GH'], ['Neev Heights Phase II Tower', 'NHPI'], ['  spaced   out ', 'SO'], ['(Phase) 2', 'P2'], ['', 'PRJ'], ['###', 'PRJ']])('%s -> %s', (name, prefix) => {
    expect(projectPrefix(name)).toBe(prefix)
  })
})
