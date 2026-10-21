import { describe, it, expect } from 'vitest'
import { buildDemandPayload, buildReceiptPayload, buildSalePayload, pickDemand } from '@/lib/documents/payload'

const at = (d: string) => new Date(d)
const schedule = (over: Record<string, unknown>) => ({
  id: 's', description: 'Plinth', principalAmount: 100000, gstAmount: 5000, status: 'UPCOMING', milestone: null, payments: [], createdAt: at('2026-01-01'), ...over,
})

const payments = [
  { id: 'p1', amount: 40000, gstPaid: 2000, createdAt: at('2026-02-01') },
  { id: 'p2', amount: 30000, gstPaid: 1500, createdAt: at('2026-03-01') },
]
const sale: any = {
  id: 'sale1', saleNumber: 'SVH-001', agreementValue: 1000000, gstAmount: 50000, stampDuty: 60000, registrationCharges: 30000,
  carParkingCharges: 0, bookingAmount: 100000, bookingDate: at('2026-01-05'), parkingPodiumLevel: null, parkingFloor: null, parkingNumber: null, tenant: null,
  project: { company: { name: 'Neev', address: 'Pune', gstin: null, panNumber: 'AAAPL1234C' }, name: 'Sea View', reraNumber: null, tdsRatePercent: 1 },
  unit: { floor: { floorNumber: 2, wing: { name: 'A' } }, unitNumber: 'A-201', configuration: '2BHK', carpetAreaSqft: 750 },
  buyers: [
    { fullName: 'Asha', address: 'x', panNumber: 'ABCDE1234F', aadhaarNumber: null, email: 'a@x.com', whatsappNumber: null, isPrimary: true },
    { fullName: 'Ravi', address: null, panNumber: null, aadhaarNumber: null, email: null, whatsappNumber: null, isPrimary: false },
  ],
  paymentSchedules: [
    schedule({ id: 'a', description: 'Booking Amount (10%)', principalAmount: 100000, gstAmount: 5000, status: 'PAID', payments }),
    schedule({ id: 'b', description: 'Plinth', principalAmount: 350000, gstAmount: 17500, status: 'OVERDUE_7', milestone: { name: 'Plinth Completion' } }),
    schedule({ id: 'c', description: 'Stamp Duty', principalAmount: 60000, gstAmount: 0, status: 'UPCOMING' }),
  ],
}

describe('buildSalePayload', () => {
  const p = buildSalePayload(sale)
  it('describes the unit and buyers', () => {
    expect(p).toMatchObject({ wingName: 'A', floorOrdinal: '2nd', unitNumber: 'A-201', carpetAreaSqm: '69.68', buyer1Name: 'Asha', buyer1Aadhaar: '' })
    expect(p.buyers.map((b) => [b.ordinal, b.isPrimary])).toEqual([['1st', 'Yes'], ['2nd', 'No']])
  })
  it('gives each demand its share of the agreement value, but not stamp duty or parking', () => {
    expect(p.paymentPlan.map((r) => [r.description, r.percentOfAV])).toEqual([['Booking Amount (10%)', '10%'], ['Plinth', '35%'], ['Stamp Duty', '—']])
  })
  it('works out the booking amount from the booking demand and the balance after it', () => {
    expect(p.bookingAmount).toBe('1,00,000.00')
    expect(p.balanceAmount).toBe('9,00,000.00')
    expect(p.tdsAmount).toBe('10,000.00')
  })
})

describe('demand letters', () => {
  it('picks the named demand, else the first one that is due, else none', () => {
    expect(pickDemand(sale, 'Plinth Completion')?.id).toBe('b')
    expect(pickDemand(sale, 'Booking Amount (10%)')?.id).toBe('a')
    expect(pickDemand(sale, null)?.id).toBe('b')
    expect(pickDemand({ ...sale, paymentSchedules: [sale.paymentSchedules[2]] }, '—')).toBeNull()
  })
  it('names the milestone and totals the demand', () => {
    const p = buildDemandPayload(sale, sale.paymentSchedules[1])
    expect(p.milestone).toEqual({ name: 'Plinth Completion' })
    expect(p.payment).toMatchObject({ principalAmount: '3,50,000.00', gstAmount: '17,500.00', totalDue: '3,67,500.00' })
    expect(buildDemandPayload(sale, null)).toMatchObject({ milestone: null, payment: null })
  })
})

describe('receipts', () => {
  const [first, second] = payments
  it('shows the balance as it stood when that payment was made, not today', () => {
    const forFirst = buildReceiptPayload(sale, first as any, sale.paymentSchedules[0]).receipt
    expect(forFirst.cumulativePaid).toBe('42,000.00') // only the first payment (40,000 + 2,000 GST)
    expect(forFirst.balanceOutstanding).toBe('9,58,000.00')
    const forSecond = buildReceiptPayload(sale, second as any, sale.paymentSchedules[0]).receipt
    expect(forSecond.cumulativePaid).toBe('73,500.00')
    expect(forSecond.amount).toBe('31,500.00')
  })
  it('falls back to a short receipt number built from the payment id', () => {
    expect(buildReceiptPayload(sale, { ...first, receiptNumber: null } as any, sale.paymentSchedules[0]).receipt.number).toBe('REC-P1')
  })
})
