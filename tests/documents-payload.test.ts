import { describe, it, expect } from 'vitest'
import { agreementPayables, COMMON_AREA_CHARGE_RESIDENTIAL } from '@/lib/documents/payables'
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

describe('sale agreement figures', () => {
  const paid = [
    { id: 'p1', amount: 40000, gstPaid: 2000, paymentDate: at('2026-02-01'), createdAt: at('2026-02-01'), bankName: 'HDFC', referenceNumber: 'U1', deletedAt: null },
    { id: 'p0', amount: 30000, gstPaid: 1500, paymentDate: at('2026-01-10'), createdAt: at('2026-01-10'), bankName: 'ICICI', referenceNumber: 'C2', deletedAt: null },
    { id: 'px', amount: 99999, gstPaid: 0, paymentDate: at('2026-03-01'), createdAt: at('2026-03-01'), bankName: 'X', referenceNumber: 'DEL', deletedAt: at('2026-03-02') },
  ]
  const flat: any = {
    ...sale, carParkingCount: 2, unit: { ...sale.unit, category: 'FLAT' },
    paymentSchedules: [schedule({ id: 'a', description: 'Booking', principalAmount: 70000, gstAmount: 3500, payments: paid }), ...sale.paymentSchedules.slice(1)],
  }
  const p = buildSalePayload(flat)

  it('lists every buyer on one line and marks the last', () => {
    expect(p.buyerNames).toBe('Asha and Ravi')
    expect(p.buyers.map((b) => b.hasNext)).toEqual([true, false])
    expect(p.buyer1Email).toBe('a@x.com')
  })
  it('counts recorded payments (not deleted ones) as the advance and lists them oldest first', () => {
    expect(p.advancePaid).toBe('70,000.00')
    expect(p.receivedTotal).toBe('73,500.00')
    expect(p.receipts.map((r) => [r.bank, r.reference, r.amount])).toEqual([['ICICI', 'C2', '31,500.00'], ['HDFC', 'U1', '42,000.00']])
    expect(p.balanceAfterAdvance).toBe('9,30,000.00')
    expect(p.balancePayable).toBe('9,20,000.00') // less the 10,000 TDS
  })
  it('has no receipt rows when nothing is paid', () => {
    expect(buildSalePayload({ ...flat, paymentSchedules: sale.paymentSchedules.slice(1) }).receipts).toEqual([])
  })
  it('keeps charges out of the instalment table and numbers the rest', () => {
    expect(p.instalments.map((r) => [r.index, r.description])).toEqual([[1, 'Booking'], [2, 'Plinth']])
  })
  it('works out the payables: 600 a sq ft, and the common area charge only for homes', () => {
    expect(p).toMatchObject({ unitKind: 'Flat', premisesType: 'Residential', hasParking: true, mcgmCharges: 'Rs. 4,50,000/-', commonAreaCharges: 'Rs. 1,00,000/-' })
    const shop = buildSalePayload({ ...flat, unit: { ...flat.unit, category: 'SHOP' }, carParkingCount: 0 })
    expect(shop).toMatchObject({ unitKind: 'Shop', premisesType: 'Commercial', hasParking: false, commonAreaCharges: 'Nil' })
    expect(agreementPayables(750, false).total - agreementPayables(750, true).total).toBe(COMMON_AREA_CHARGE_RESIDENTIAL)
  })
})

describe('demand letter position', () => {
  it('shows the demand as a share of the price and what is still to pay', () => {
    const paid = [{ id: 'p', amount: 100000, gstPaid: 5000, paymentDate: at('2026-01-06'), createdAt: at('2026-01-06'), deletedAt: null }]
    const s: any = { ...sale, paymentSchedules: [schedule({ id: 'a', description: 'Booking', principalAmount: 100000, gstAmount: 5000, payments: paid }), sale.paymentSchedules[1]] }
    expect(buildDemandPayload(s, s.paymentSchedules[1]).payment).toMatchObject({
      percentOfAV: '35%', receivedTillDate: '1,00,000.00', totalOutstanding: '9,00,000.00', gstOutstanding: '17,500.00',
    })
  })
})

describe('payment banks', () => {
  it('lists each bank once in paymentBankNames, leaving out blanks and deleted payments', () => {
    const at2 = (d: string) => new Date(d)
    const pays = [
      { id: 'a', amount: 1, gstPaid: 0, paymentDate: at2('2026-02-01'), createdAt: at2('2026-02-01'), bankName: 'HDFC Bank', deletedAt: null },
      { id: 'b', amount: 1, gstPaid: 0, paymentDate: at2('2026-02-02'), createdAt: at2('2026-02-02'), bankName: ' HDFC Bank ', deletedAt: null },
      { id: 'c', amount: 1, gstPaid: 0, paymentDate: at2('2026-02-03'), createdAt: at2('2026-02-03'), bankName: 'ICICI Bank', deletedAt: null },
      { id: 'd', amount: 1, gstPaid: 0, paymentDate: at2('2026-02-04'), createdAt: at2('2026-02-04'), bankName: null, deletedAt: null },
      { id: 'e', amount: 1, gstPaid: 0, paymentDate: at2('2026-02-05'), createdAt: at2('2026-02-05'), bankName: 'Gone Bank', deletedAt: at2('2026-02-06') },
    ]
    const s: any = { ...sale, unit: { ...sale.unit, category: 'FLAT' }, carParkingCount: 0, paymentSchedules: [schedule({ payments: pays })] }
    expect(buildSalePayload(s).paymentBankNames).toBe('HDFC Bank, ICICI Bank')
    expect(buildSalePayload({ ...s, paymentSchedules: [schedule({})] }).paymentBankNames).toBe('')
  })
})
