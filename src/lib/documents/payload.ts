import { formatDate, formatMoney, numberToWords } from '@/lib/format'
import { percentOf } from '@/lib/money'
import { revealPii } from '@/lib/pii' // agreements carry the real numbers; nothing else does

/**
 * The data every document template can use ({{tags}}), built in ONE place for sale agreements, demand letters and
 * receipts. The catalogue shown to users is lib/template-tags.ts: add a tag here and there together.
 */

import type { SaleForDocument, ReceiptPayment, ReceiptSchedule } from './queries'

type Schedule = SaleForDocument['paymentSchedules'][number]

/** Schedules that are asking for money now (a demand letter is about one of these). */
export const DUE_STATUSES = ['DUE', 'OVERDUE_7', 'OVERDUE_15', 'OVERDUE_30', 'OVERDUE_30PLUS']

const SQFT_TO_SQM = 0.092903
const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`)
const sum = (rows: Schedule[], f: (s: Schedule) => number) => rows.reduce((total, s) => total + f(s), 0)

/** The demand a letter is about: the one named by the caller if given, else the first that is due. */
export function pickDemand(sale: SaleForDocument, milestoneName?: string | null): Schedule | null {
  const named = milestoneName && milestoneName !== '—' && milestoneName !== 'null'
    ? sale.paymentSchedules.find((ps) => ps.milestone?.name === milestoneName || ps.description === milestoneName)
    : undefined
  return named ?? sale.paymentSchedules.find((ps) => DUE_STATUSES.includes(ps.status)) ?? null
}

/** A partner as a document needs them (the PAN is still encrypted here: revealPii turns it into the real number). */
export interface PartnerForDocument { name: string; address: string | null; panNumber: string | null }

/** `partners`: the partners chosen for a sale agreement (none for other documents). */
export function buildSalePayload(sale: SaleForDocument, partners: PartnerForDocument[] = []) {
  const { project, unit, buyers, paymentSchedules: schedules } = sale
  const { company } = project
  const agreement = Number(sale.agreementValue)

  const paymentPlan = schedules.filter((ps) => Number(ps.principalAmount) > 0).map((ps, index) => {
    const principal = Number(ps.principalAmount)
    const gst = Number(ps.gstAmount)
    const description = ps.description.toLowerCase()
    const isCharge = ['stamp duty', 'parking', 'registration'].some((w) => description.includes(w))
    const pct = isCharge ? 0 : Number(((principal / agreement) * 100).toFixed(2))
    return {
      index: index + 1,
      description: ps.description,
      percentOfAV: pct > 0 ? `${pct}%` : '—',
      principalAmount: formatMoney(principal),
      gstAmount: formatMoney(gst),
      totalAmount: formatMoney(principal + gst),
    }
  })

  const bookingSchedule = schedules.find((ps) => ps.description.toLowerCase().includes('booking')) ?? schedules[0]
  const bookingAmount = bookingSchedule ? Number(bookingSchedule.principalAmount) : (sale.bookingAmount || 0)
  const tds = percentOf(agreement, project.tdsRatePercent) // what the buyer deducts, at this project's configured rate
  const first = buyers[0]

  return {
    companyName: company.name,
    companyAddress: company.address,
    companyGstin: company.gstin ?? '',
    companyPan: company.panNumber ?? '',
    partners: partners.map((p, i) => ({ index: i + 1, ordinal: ordinal(i + 1), name: p.name, address: p.address ?? '', panNumber: revealPii(p.panNumber) })),
    partner1Name: partners[0]?.name ?? '',
    partner1Address: partners[0]?.address ?? '',
    partner1Pan: revealPii(partners[0]?.panNumber),
    partner2Name: partners[1]?.name ?? '',
    partner2Address: partners[1]?.address ?? '',
    partner2Pan: revealPii(partners[1]?.panNumber),
    projectName: project.name,
    reraNumber: project.reraNumber ?? '',
    wingName: unit.floor.wing.name,
    floorNumber: unit.floor.floorNumber.toString(),
    floorOrdinal: ordinal(unit.floor.floorNumber),
    unitNumber: unit.unitNumber,
    configuration: unit.configuration,
    carpetArea: unit.carpetAreaSqft.toString(),
    carpetAreaSqm: (unit.carpetAreaSqft * SQFT_TO_SQM).toFixed(2),
    buyer1Name: first?.fullName ?? '',
    buyer1Address: first?.address ?? '',
    buyer1Pan: revealPii(first?.panNumber),
    buyer1Aadhaar: revealPii(first?.aadhaarNumber),
    buyers: buyers.map((b, i) => ({
      index: i + 1,
      ordinal: ordinal(i + 1),
      fullName: b.fullName ?? '',
      panNumber: revealPii(b.panNumber),
      aadhaarNumber: revealPii(b.aadhaarNumber),
      email: b.email ?? '',
      whatsappNumber: b.whatsappNumber ?? '',
      address: b.address ?? '',
      isPrimary: b.isPrimary ? 'Yes' : 'No',
    })),
    agreementValue: formatMoney(agreement),
    agreementValueWords: numberToWords(agreement),
    gstAmount: formatMoney(sale.gstAmount),
    stampDuty: formatMoney(sale.stampDuty),
    registrationCharges: formatMoney(sale.registrationCharges),
    carParkingCharges: formatMoney(sale.carParkingCharges),
    parkingPodiumLevel: sale.parkingPodiumLevel ?? '',
    parkingFloor: sale.parkingFloor ?? '',
    parkingNumber: sale.parkingNumber ?? '',
    bookingAmount: formatMoney(bookingAmount),
    bookingAmountWords: numberToWords(bookingAmount),
    balanceAmount: formatMoney(agreement - bookingAmount),
    balanceAmountWords: numberToWords(agreement - bookingAmount),
    tdsAmount: formatMoney(tds),
    tdsAmountWords: numberToWords(tds),
    bookingDate: formatDate(sale.bookingDate),
    todayDate: formatDate(new Date()),
    oldFlatNumber: sale.tenant?.oldFlatNumber ?? '',
    oldArea: sale.tenant?.oldAreaSqft?.toString() ?? '',
    extraArea: sale.tenant?.extraAreaSqft?.toString() ?? '',
    paymentPlan,
    paymentPlanTotalAmount: formatMoney(sum(schedules, (s) => Number(s.principalAmount))),
    paymentPlanTotalGst: formatMoney(sum(schedules, (s) => Number(s.gstAmount))),
    paymentPlanGrandTotal: formatMoney(sum(schedules, (s) => Number(s.principalAmount) + Number(s.gstAmount))),
  }
}

const demandFigures = (s: Pick<Schedule, 'principalAmount' | 'gstAmount'>) => {
  const total = Number(s.principalAmount) + Number(s.gstAmount)
  return { principalAmount: formatMoney(s.principalAmount), gstAmount: formatMoney(s.gstAmount), totalDue: formatMoney(total), amountInWords: numberToWords(total) }
}

/** A sale document about one demand (a demand letter). `schedule` null = nothing is due, the payment tags are left empty. */
export function buildDemandPayload(sale: SaleForDocument, schedule: Schedule | null, partners: PartnerForDocument[] = []) {
  return {
    ...buildSalePayload(sale, partners),
    milestone: schedule ? { name: schedule.milestone?.name ?? schedule.description } : null,
    payment: schedule ? demandFigures(schedule) : null,
  }
}

/** A sale document about one payment received (a receipt), with the balance as it stood when that payment was made. */
export function buildReceiptPayload(sale: SaleForDocument, payment: ReceiptPayment, schedule: ReceiptSchedule) {
  const totalSaleValue = Number(sale.agreementValue) + (sale.carParkingCharges ?? 0)
  const paidUntilNow = sale.paymentSchedules
    .flatMap((ps) => ps.payments)
    .filter((p) => new Date(p.createdAt) <= new Date(payment.createdAt)) // later payments are not on this receipt
    .reduce((total, p) => total + Number(p.amount) + Number(p.gstPaid ?? 0), 0)
  const received = Number(payment.amount) + Number(payment.gstPaid ?? 0)

  return {
    ...buildSalePayload(sale),
    milestone: { name: schedule.description },
    payment: demandFigures(schedule),
    receipt: {
      number: payment.receiptNumber ?? `REC-${payment.id.substring(0, 6).toUpperCase()}`,
      date: formatDate(payment.paymentDate),
      principalPaid: formatMoney(payment.amount),
      gstPaid: formatMoney(payment.gstPaid),
      amount: formatMoney(received),
      amountWords: numberToWords(received),
      mode: payment.mode,
      reference: payment.referenceNumber ?? 'N/A',
      bankName: payment.bankName ?? 'N/A',
      cumulativePaid: formatMoney(paidUntilNow),
      balanceOutstanding: formatMoney(totalSaleValue - paidUntilNow),
    },
  }
}

/** Any of the payloads above: what a template renderer needs. */
export type DocumentPayload = ReturnType<typeof buildSalePayload> & Record<string, unknown>
