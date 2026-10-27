import { describe, it, expect } from 'vitest'
import { buildDemandPayload, buildReceiptPayload, buildSalePayload } from '@/lib/documents/payload'
import { deriveSaleStatus } from '@/lib/sale-lifecycle'
import { isOfflineCharge } from '@/lib/payment-plans'
import { isTdsPayment, paymentKindLabel, paymentModeLabel } from '@/lib/status'

const at = (d: string) => new Date(d)
const pay = (over: Record<string, unknown>) => ({ id: 'p', amount: 0, gstPaid: 0, interestPaid: 0, mode: 'NEFT', paymentDate: at('2026-02-01'), createdAt: at('2026-02-01'), deletedAt: null, bankName: null, referenceNumber: null, receiptNumber: 'RCP-1', ...over })
const schedule = (over: Record<string, unknown>) => ({
  id: 's', description: 'Booking', principalAmount: 1000000, gstAmount: 50000, status: 'DUE', milestone: null, payments: [], createdAt: at('2026-01-01'), dueDate: at('2026-02-15'), demandGeneratedDate: at('2026-01-01'), interestWaivers: [], ...over,
})

describe('offline charges', () => {
  it('names stamp duty and registration, and nothing else', () => {
    expect(['Stamp Duty and Registration', 'Stamp Duty', 'Registration'].every(isOfflineCharge)).toBe(true)
    expect(['Booking', '6th Slab', 'Other Charges', 'Car Parking'].some(isOfflineCharge)).toBe(false)
  })
  it('do not make a sale "in progress" or stop it being "agreement done"', () => {
    const base = { agreementDate: at('2026-03-01'), possessionDate: null }
    expect(deriveSaleStatus({ ...base, paymentSchedules: [{ status: 'DUE', description: 'Booking' }, { status: 'PAID', description: 'Stamp Duty and Registration' }] })).toBe('AGREEMENT_DONE')
    expect(deriveSaleStatus({ ...base, paymentSchedules: [{ status: 'DUE', description: 'Booking' }, { status: 'DUE', description: 'Plinth' }] })).toBe('IN_PROGRESS')
  })
})

describe('payment kind', () => {
  it('says what a payment cleared', () => {
    expect(paymentKindLabel({ amount: 100, gstPaid: 0, interestPaid: 0 })).toBe('Principal')
    expect(paymentKindLabel({ amount: 0, gstPaid: 5, interestPaid: 0 })).toBe('GST')
    expect(paymentKindLabel({ amount: 100, gstPaid: 0, interestPaid: 3 })).toBe('Principal and interest')
    expect(paymentKindLabel({ amount: 0, gstPaid: 0, interestPaid: 3 })).toBe('Interest')
    expect(paymentKindLabel({ mode: 'TDS', amount: 100 })).toBe('TDS on principal')
  })
  it('knows a TDS credit', () => {
    expect(isTdsPayment({ mode: 'TDS' })).toBe(true)
    expect(isTdsPayment({ mode: 'NEFT' })).toBe(false)
    expect(paymentModeLabel('TDS')).toBe('TDS adjusted')
  })
})

const sale = (schedules: any[]): any => ({
  id: 'sale1', saleNumber: 'SVH-001', agreementValue: 10000000, gstAmount: 500000, stampDuty: 600000, registrationCharges: 300000,
  carParkingCharges: 0, bookingAmount: 1000000, bookingDate: at('2026-01-05'), parkingPodiumLevel: null, parkingFloor: null, parkingNumber: null, tenant: null, carParkingCount: 0, otherCharges: [],
  project: { company: { name: 'Neev', address: 'Pune', gstin: null, panNumber: null, contactNumbers: null }, name: 'Sea View', reraNumber: null, tdsRatePercent: 1, charges: [], contactNumbers: null,
    interestEnabled: false, interestRatePercent: 12, interestGraceDays: 7, interestDefaultOrder: 'INTEREST_FIRST', interestOnDemand: 'WHEN_ACCRUED' },
  unit: { floor: { floorNumber: 2, wing: { name: 'A' } }, unitNumber: 'A-201', configuration: '2BHK', carpetAreaSqft: 750, category: 'FLAT' },
  buyers: [{ fullName: 'Asha', address: 'x', panNumber: null, aadhaarNumber: null, email: null, whatsappNumber: null, isPrimary: true }],
  paymentSchedules: schedules,
})

describe('the agreement payment schedule', () => {
  it('leaves the other charges out of the instalments and their total %', () => {
    const p = buildSalePayload(sale([
      schedule({ id: 'a', description: 'Booking', principalAmount: 1000000, gstAmount: 50000 }),
      schedule({ id: 'b', description: 'Possession', principalAmount: 9000000, gstAmount: 450000, status: 'UPCOMING' }),
      schedule({ id: 'c', description: 'Other Charges', principalAmount: 788600, gstAmount: 0, status: 'UPCOMING' }),
      schedule({ id: 'd', description: 'Stamp Duty and Registration', principalAmount: 900000, gstAmount: 0, status: 'UPCOMING' }),
    ]))
    expect(p.instalments.map((r) => r.description)).toEqual(['Booking', 'Possession'])
    expect(p.instalmentsTotalPercent).toBe('100%')
    expect(p.paymentPlan.map((r) => r.description)).toContain('Other Charges') // the full plan still lists everything
  })
})

describe('TDS in documents', () => {
  const booking = (payments: any[]) => schedule({ id: 'a', description: 'Booking', payments })
  const tds = pay({ id: 't', mode: 'TDS', amount: 100000, receiptNumber: 'TDS-1' })

  it('is not a receipt and not money received, but counts towards the price', () => {
    const cash = pay({ id: 'c', amount: 900000, bankName: 'HDFC' })
    const p = buildSalePayload(sale([booking([cash, tds])]))
    expect(p.receipts).toHaveLength(1)
    expect(p.receivedTotal).toBe('9,00,000.00')
    expect(p.tdsAdjusted).toBe('1,00,000.00')
    expect(p.advancePaid).toBe('10,00,000.00')
  })
  it('lowers the principal due on the demand, and leaves the GST due in full', () => {
    const s = sale([booking([tds])])
    const { payment } = buildDemandPayload(s, s.paymentSchedules[0])
    expect(payment).toMatchObject({ principalDue: '9,00,000.00', gstDue: '50,000.00', dueNow: '9,50,000.00', tdsAdjusted: '1,00,000.00', principalAmount: '10,00,000.00' })
  })
  it('splits what is due on this demand alone, after a payment on it', () => {
    const s = sale([booking([pay({ amount: 400000 })]), schedule({ id: 'b', description: 'Plinth', principalAmount: 500000, gstAmount: 25000, status: 'DUE' })])
    expect(buildDemandPayload(s, s.paymentSchedules[1]).payment).toMatchObject({ principalDue: '5,00,000.00', gstDue: '25,000.00' })
    expect(buildDemandPayload(s, s.paymentSchedules[0]).payment).toMatchObject({ principalDue: '6,00,000.00', gstDue: '50,000.00' })
  })
  it('keeps stamp duty and registration out of what is outstanding, even once they are paid', () => {
    const s = sale([booking([]), schedule({ id: 'd', description: 'Stamp Duty and Registration', principalAmount: 900000, gstAmount: 0, status: 'PAID' })])
    expect(buildDemandPayload(s, s.paymentSchedules[0]).payment).toMatchObject({ outstandingPrincipal: '10,00,000.00', totalOutstanding: '10,50,000.00' })
  })
})

describe('receipt tags: the milestone and what was paid', () => {
  it('names the milestone and whether it was principal or GST', () => {
    const s = sale([schedule({ id: 'a', description: '6th Slab' })])
    const forPrincipal = buildReceiptPayload(s, pay({ amount: 450000 }) as any, s.paymentSchedules[0]).receipt
    expect(forPrincipal).toMatchObject({ milestone: '6th Slab', kind: 'Principal', towards: '6th Slab (Principal)' })
    const forGst = buildReceiptPayload(s, pay({ gstPaid: 22500 }) as any, s.paymentSchedules[0]).receipt
    expect(forGst).toMatchObject({ milestone: '6th Slab', kind: 'GST', towards: '6th Slab (GST)' })
  })
  it('puts the milestone and kind on each row of the agreement receipts table', () => {
    const s = sale([schedule({ id: 'a', description: 'Booking', payments: [pay({ amount: 900000 }), pay({ id: 'g', gstPaid: 50000, paymentDate: at('2026-02-02') })] })])
    expect(buildSalePayload(s).receipts.map((r) => [r.milestone, r.kind])).toEqual([['Booking', 'Principal'], ['Booking', 'GST']])
  })
})
