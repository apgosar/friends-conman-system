import { describe, it, expect } from 'vitest'
import { parsePricingSettings } from '@/lib/pricing-settings'

describe('parsePricingSettings', () => {
  it('accepts numbers and the numeric strings a form posts', () => {
    expect(parsePricingSettings({ gstRatePercent: '12', stampDutyPercent: 7, regChargesCap: '50000', regParkingCharges: '0' }).data)
      .toEqual({ gstRatePercent: 12, stampDutyPercent: 7, regChargesCap: 50000, regParkingCharges: 0 })
  })
  it('treats a blank cap as no cap, and a missing field as unchanged', () => {
    expect(parsePricingSettings({ regChargesCap: '' }).data).toEqual({ regChargesCap: null })
    expect(parsePricingSettings({ name: 'x' }).data).toEqual({})
    expect(parsePricingSettings(undefined).data).toEqual({})
  })
  it.each([
    [{ gstRatePercent: -1 }, /GST rate cannot be negative/],
    [{ stampDutyPercent: 101 }, /Stamp duty cannot be more than 100/],
    [{ tdsRatePercent: 'abc' }, /TDS rate must be a number/],
    [{ interestRatePercent: "" }, /Interest rate is required/],
    [{ regParkingCharges: -5 }, /cannot be negative/],
    [{ regChargesPercent: NaN }, /./],
  ])('rejects %j', (body, message) => {
    expect(parsePricingSettings(body).error).toMatch(message)
  })
})
