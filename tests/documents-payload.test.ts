import { describe, it, expect } from 'vitest'
import { DEFAULT_OTHER_CHARGES } from '@/lib/other-charges'
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
  it('describes the unit: flat or shop, residential or commercial, with parking only when one is sold', () => {
    expect(p).toMatchObject({ unitKind: 'Flat', premisesType: 'Residential', hasParking: true })
    expect(buildSalePayload({ ...flat, unit: { ...flat.unit, category: 'SHOP' }, carParkingCount: 0 })).toMatchObject({ unitKind: 'Shop', premisesType: 'Commercial', hasParking: false })
  })
  it('lists the project\'s other charges for the unit, with the total (a sq ft rate on the carpet area, Nil for the other kind of unit)', () => {
    const withCharges = (over: Record<string, unknown> = {}) => ({ ...flat, ...over, project: { ...flat.project, charges: DEFAULT_OTHER_CHARGES } })
    const home = buildSalePayload(withCharges())
    expect(home.otherCharges).toHaveLength(9)
    expect(home.otherCharges[5]).toMatchObject({ index: 6, amount: 'Rs. 4,50,000/-' }) // 600 a sq ft on 750 sq ft
    expect(home.otherCharges[1].amount).toBe('As Determined at the time of assessment')
    expect(home.otherCharges[8].amount).toBe('Rs. 1,00,000/-')
    expect(home.otherChargesTotal).toBe('Rs. 7,40,600/-')
    const shop = buildSalePayload(withCharges({ unit: { ...flat.unit, category: 'SHOP' }, carParkingCount: 0 }))
    expect(shop.otherCharges[8].amount).toBe('Nil')
    expect(shop.otherChargesTotal).toBe('Rs. 6,40,600/-')
  })
  it('uses the charges the sale was made with, not the project\'s list as it is now', () => {
    const saved = [{ name: 'Legal', amountType: 'FIXED', rate: 15000, amount: 15000, text: 'Rs. 15,000/-' }]
    const p2 = buildSalePayload({ ...flat, otherCharges: saved, project: { ...flat.project, charges: DEFAULT_OTHER_CHARGES } })
    expect(p2.otherCharges).toEqual([{ index: 1, name: 'Legal', amount: 'Rs. 15,000/-' }])
    expect(p2.otherChargesTotal).toBe('Rs. 15,000/-')
  })
})

describe('demand letter position', () => {
  const paid = [{ id: 'p', amount: 100000, gstPaid: 5000, paymentDate: at('2026-01-06'), createdAt: at('2026-01-06'), deletedAt: null }]
  const booking: any = schedule({ id: 'a', description: 'Booking', principalAmount: 100000, gstAmount: 5000, status: 'PAID', payments: paid })
  const plinth: any = schedule({ id: 'b', description: 'Plinth', principalAmount: 350000, gstAmount: 17500, status: 'DUE' })

  it('with nothing unpaid before it, the outstanding is just this demand, principal and GST apart', () => {
    const s: any = { ...sale, paymentSchedules: [booking, plinth, schedule({ id: 'c', description: 'Slab', principalAmount: 200000, gstAmount: 10000, status: 'UPCOMING' })] }
    expect(buildDemandPayload(s, plinth).payment).toMatchObject({
      percentOfAV: '35%', receivedTillDate: '1,00,000.00',
      outstandingPrincipal: '3,50,000.00', outstandingGst: '17,500.00', totalOutstanding: '3,67,500.00', gstOutstanding: '17,500.00', previousOutstanding: '0.00',
    }) // the upcoming slab is not counted
  })
  it('adds earlier unpaid demands to the outstanding', () => {
    const earlier = schedule({ id: 'e', description: 'Plinth', principalAmount: 200000, gstAmount: 10000, status: 'OVERDUE_7' })
    const s: any = { ...sale, paymentSchedules: [booking, earlier, plinth] }
    expect(buildDemandPayload(s, plinth).payment).toMatchObject({
      outstandingPrincipal: '5,50,000.00', outstandingGst: '27,500.00', totalOutstanding: '5,77,500.00', previousOutstanding: '2,10,000.00',
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

describe('the advance in the agreement', () => {
  const booking: any = schedule({ id: 'a', description: 'Booking', principalAmount: 100000, gstAmount: 5000, status: 'DUE' })
  const withPaid = (amount: number): any => ({ ...sale, carParkingCount: 0, unit: { ...sale.unit, category: 'FLAT' }, paymentSchedules: [{ ...booking, payments: amount ? [{ id: 'p', amount, gstPaid: 0, paymentDate: at('2026-02-01'), createdAt: at('2026-02-01'), bankName: null, deletedAt: null }] : [] }] })

  it('is the booking amount when nothing has been recorded as paid yet', () => {
    expect(buildSalePayload(withPaid(0))).toMatchObject({ advancePaid: '1,00,000.00', balanceAfterAdvance: '9,00,000.00' })
  })
  it('is what was paid when that is more than the booking', () => {
    expect(buildSalePayload(withPaid(150000))).toMatchObject({ advancePaid: '1,50,000.00', balanceAfterAdvance: '8,50,000.00' })
  })
})

describe('interest in a demand letter and a receipt', () => {
  const DAY = 86_400_000
  const project = (over: Record<string, unknown> = {}) => ({ ...sale.project, interestEnabled: true, interestRatePercent: 12, interestGraceDays: 7, interestDefaultOrder: 'INTEREST_FIRST', interestOnDemand: 'WHEN_ACCRUED', ...over })
  const late: any = schedule({ id: 'l', description: 'Plinth', principalAmount: 100000, gstAmount: 5000, status: 'OVERDUE_15', dueDate: new Date(Date.now() - 27 * DAY), demandGeneratedDate: new Date(Date.now() - 41 * DAY), interestWaivers: [] })
  const sold = (over: Record<string, unknown> = {}, sched: any = late): any => ({ ...sale, project: project(over), paymentSchedules: [sched] })

  it('shows what has accrued on the demand, the rate, the date interest starts and a ready sentence', () => {
    const p = buildDemandPayload(sold(), late).payment as Record<string, unknown>
    expect(p.interestRate).toBe('12%')
    expect(Number(String(p.interestAccrued).replace(/,/g, ''))).toBeGreaterThan(0) // 20 days past the grace days
    expect(p.interestOutstanding).toBe(p.interestAccrued)
    expect(p.showInterest).toBe(true)
    expect(String(p.interestNote)).toMatch(/^Interest @ 12% p\.a\. is charged on a payment received after \d\d\/\d\d\/\d{4}$/)
    expect(p.totalOutstanding).not.toBe('1,05,000.00') // the interest is in it
  })
  it('follows the project: hidden when set to Never, always shown when set to Always, none when off', () => {
    expect((buildDemandPayload(sold({ interestOnDemand: 'NEVER' }), late).payment as any).showInterest).toBe(false)
    const notYet: any = schedule({ id: 'n', description: 'Plinth', principalAmount: 100000, gstAmount: 5000, status: 'DUE', dueDate: new Date(Date.now() + 5 * DAY), interestWaivers: [] })
    expect((buildDemandPayload(sold({}, notYet), notYet).payment as any).showInterest).toBe(false) // nothing accrued yet
    expect((buildDemandPayload(sold({ interestOnDemand: 'ALWAYS' }, notYet), notYet).payment as any).showInterest).toBe(true)
    const off = buildDemandPayload(sold({ interestEnabled: false }), late).payment as any
    expect(off).toMatchObject({ interestAccrued: '0.00', interestNote: '', interestStartDate: '' })
  })
  it('counts interest paid in a receipt, and in the total received', () => {
    const pay: any = { id: 'p1', amount: 1000, gstPaid: 0, interestPaid: 250, paymentDate: at('2026-02-01'), createdAt: at('2026-02-01'), deletedAt: null, mode: 'NEFT', receiptNumber: 'R1', referenceNumber: null, bankName: null }
    const r = buildReceiptPayload(sold({}, { ...late, payments: [pay] }), pay, { ...late, payments: [pay] }).receipt
    expect(r).toMatchObject({ principalPaid: '1,000.00', interestPaid: '250.00', amount: '1,250.00' })
  })
})

describe('payment mode in documents', () => {
  it('prints the mode as the Record Payment screen names it, in a receipt and in the agreement receipts table', () => {
    const pays = [
      { id: 'a', amount: 1, gstPaid: 0, interestPaid: 0, paymentDate: at('2026-02-01'), createdAt: at('2026-02-01'), bankName: null, deletedAt: null, mode: 'DD', receiptNumber: 'R1', referenceNumber: null },
      { id: 'b', amount: 1, gstPaid: 0, interestPaid: 0, paymentDate: at('2026-02-02'), createdAt: at('2026-02-02'), bankName: null, deletedAt: null, mode: 'NEFT', receiptNumber: 'R2', referenceNumber: null },
    ]
    const sched: any = schedule({ id: 'm', description: 'Booking', payments: pays })
    const s: any = { ...sale, carParkingCount: 0, unit: { ...sale.unit, category: 'FLAT' }, paymentSchedules: [sched] }
    expect(buildSalePayload(s).receipts.map((r) => r.mode)).toEqual(['Demand Draft', 'NEFT'])
    expect(buildReceiptPayload(s, pays[0] as any, sched).receipt.mode).toBe('Demand Draft')
  })
})
