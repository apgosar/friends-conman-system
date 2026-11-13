import { describe, it, expect } from 'vitest'
import { checkCorrection, proposeCorrection } from '@/lib/sales/correct-agreement-value'
import { amountInWords } from '@/lib/format'

const schedule = (id: string, description: string, principal: number, gst: number, paid = 0, raised = true) => ({
  id, description, status: raised ? 'DUE' : 'UPCOMING', demandGeneratedDate: raised ? new Date() : null, principalAmount: principal, gstAmount: gst,
  payments: paid ? [{ amount: paid, gstPaid: 0, deletedAt: null }] : [],
})
// 1,00,00,000 sold as 10% booking + 3 x 30%, GST 5%, with stamp duty and parking lines that do not follow the value
const sale = {
  agreementValue: 10_000_000, stampDuty: 600_000, registrationCharges: 30_000, carParking: true, carParkingIncluded: false,
  project: { stampDutyPercent: 6, regChargesPercent: 1, regChargesCap: 30_000, regParkingCharges: 0, gstRatePercent: 5 },
  paymentSchedules: [
    schedule('b', 'Booking', 1_000_000, 50_000, 1_000_000),
    schedule('p', 'Plinth', 3_000_000, 150_000),
    schedule('s', 'Slab', 3_000_000, 150_000, 0, false),
    schedule('o', 'Possession', 3_000_000, 150_000, 0, false),
    schedule('sd', 'Stamp Duty and Registration', 630_000, 0),
    schedule('cp', 'Car Parking', 500_000, 0),
  ],
}

describe('proposeCorrection', () => {
  it('scales each instalment and its GST to the new value, and leaves parking and stamp duty lines out', () => {
    const p = proposeCorrection(sale, 12_500_000)
    expect(p.rows.map((r) => [r.description, r.newPrincipal, r.newGst])).toEqual([
      ['Booking', 1_250_000, 62_500], ['Plinth', 3_750_000, 187_500], ['Slab', 3_750_000, 187_500], ['Possession', 3_750_000, 187_500],
    ])
    expect(p.rows[0].principalPaid).toBe(1_000_000)
    expect(p.instalmentsMatchValue).toBe(true)
    expect([p.stampDuty, p.registration]).toEqual([750_000, 30_000]) // 6%, and 1% capped at 30,000
  })
  it('puts the rounding on the last instalment so they still add up to the value', () => {
    const p = proposeCorrection(sale, 10_000_001)
    expect(p.rows.reduce((t, r) => t + r.newPrincipal, 0)).toBe(10_000_001)
  })
})

describe('checkCorrection', () => {
  const p = proposeCorrection(sale, 9_000_000)
  const input = (over: Partial<Record<string, number>> = {}) => ({
    agreementValue: 9_000_000, stampDuty: p.stampDuty, registration: p.registration, reason: 'typo', sendRevisedLetters: true,
    rows: p.rows.map((r) => ({ scheduleId: r.scheduleId, principalAmount: over[r.scheduleId] ?? r.newPrincipal, gstAmount: r.newGst })),
  })
  it('accepts the proposal, but not an instalment below what was received on it', () => {
    expect(checkCorrection(p, input({ b: 1_000_000, p: 2_600_000 }))).toBeNull()
    expect(checkCorrection(p, input())).toMatch(/Booking: ₹10,00,000 has already been received/) // 9,00,000 proposed
  })
  it('refuses instalments that no longer add up to the value, and an unchanged value', () => {
    expect(checkCorrection(p, input({ b: 1_000_000 }))).toMatch(/add up to/)
    const same = proposeCorrection(sale, 10_000_000)
    expect(checkCorrection(same, { ...input(), agreementValue: 10_000_000 })).toMatch(/same as the current one/)
  })
})

describe('amountInWords', () => {
  it('writes rupees and paise in Indian words, and nothing for no amount', () => {
    expect(amountInWords(12_500_000)).toBe('Rupees One Crore Twenty Five Lakh Only')
    expect(amountInWords('1050000.5')).toBe('Rupees Ten Lakh Fifty Thousand and Fifty Paise Only')
    expect(amountInWords(0.75)).toBe('Seventy Five Paise Only')
    expect(amountInWords('')).toBe('')
    expect(amountInWords(0)).toBe('')
  })
})
