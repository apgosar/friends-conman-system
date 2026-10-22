import { formatDate, formatMoney, numberToWords } from '@/lib/format'
import { percentOf } from '@/lib/money'
import { formatPhoneList } from '@/lib/phone'
import { revealPii } from '@/lib/pii' // agreements carry the real numbers; nothing else does
import { agreementPayables, rsText } from './payables'

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

  // Every line of the sale's payment schedule; charges (stamp duty, registration, parking) are not instalments of the price
  const lines = schedules.filter((ps) => Number(ps.principalAmount) > 0).map((ps) => {
    const principal = Number(ps.principalAmount)
    const gst = Number(ps.gstAmount)
    const description = ps.description.toLowerCase()
    const isCharge = ['stamp duty', 'parking', 'registration'].some((w) => description.includes(w))
    const pct = isCharge ? 0 : Number(((principal / agreement) * 100).toFixed(2))
    return { isCharge, principal, gst, pct, description: ps.description }
  })
  const row = (l: (typeof lines)[number], index: number) => ({
    index,
    description: l.description,
    percentOfAV: l.pct > 0 ? `${l.pct}%` : '—',
    principalAmount: formatMoney(l.principal),
    gstAmount: formatMoney(l.gst),
    totalAmount: formatMoney(l.principal + l.gst),
  })
  const paymentPlan = lines.map((l, i) => row(l, i + 1))
  /** The instalments of the price (the table in a sale agreement): the same lines without the charges, numbered again. */
  const instalmentLines = lines.filter((l) => !l.isCharge)
  const instalments = instalmentLines.map((l, i) => row(l, i + 1))

  // Money the buyers have already paid: each payment is principal (a part of the price) plus the GST on it
  const payments = schedules
    .flatMap((ps) => ps.payments)
    .filter((p) => !p.deletedAt)
    .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime())
  const advance = payments.reduce((total, p) => total + Number(p.amount), 0)
  const receivedTotal = payments.reduce((total, p) => total + Number(p.amount) + Number(p.gstPaid), 0)
  const receipts = payments.map((p, i) => ({
    index: i + 1,
    bank: p.bankName ?? '',
    branch: '', // the branch is not recorded with a payment
    reference: p.referenceNumber ?? '',
    date: formatDate(p.paymentDate),
    amount: formatMoney(Number(p.amount) + Number(p.gstPaid)),
  }))

  const bookingSchedule = schedules.find((ps) => ps.description.toLowerCase().includes('booking')) ?? schedules[0]
  const bookingAmount = bookingSchedule ? Number(bookingSchedule.principalAmount) : (sale.bookingAmount || 0)
  const tds = percentOf(agreement, project.tdsRatePercent) // what the buyer deducts, at this project's configured rate
  const first = buyers[0]
  const commercial = unit.category === 'SHOP' || unit.category === 'OFFICE'
  const payables = agreementPayables(unit.carpetAreaSqft, commercial)
  const names = buyers.map((b) => b.fullName).filter(Boolean)
  const buyerNames = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '')
  const balanceAfterAdvance = agreement - advance

  return {
    companyName: company.name,
    companyAddress: company.address,
    companyGstin: company.gstin ?? '',
    companyPan: company.panNumber ?? '',
    contactNumbers: formatPhoneList(project.contactNumbers ?? company.contactNumbers), // the project's own, else the company's
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
    unitKind: unit.category === 'SHOP' ? 'Shop' : unit.category === 'OFFICE' ? 'Office' : 'Flat',
    premisesType: commercial ? 'Commercial' : 'Residential',
    carParkingCount: String(sale.carParkingCount),
    hasParking: sale.carParkingCount > 0,
    buyerNames,
    buyer1Name: first?.fullName ?? '',
    buyer1Email: first?.email ?? '',
    buyer1Whatsapp: first?.whatsappNumber ?? '',
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
      hasNext: i < buyers.length - 1, // for "; " between buyers written on one line
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
    instalments,
    instalmentsTotalPercent: `${Number(instalmentLines.reduce((total, l) => total + l.pct, 0).toFixed(2))}%`,
    instalmentsTotalPrincipal: formatMoney(instalmentLines.reduce((total, l) => total + l.principal, 0)),
    instalmentsTotalGst: formatMoney(instalmentLines.reduce((total, l) => total + l.gst, 0)),
    advancePaid: formatMoney(advance),
    advancePaidWords: numberToWords(advance),
    balanceAfterAdvance: formatMoney(balanceAfterAdvance),
    balanceAfterAdvanceWords: numberToWords(balanceAfterAdvance),
    balancePayable: formatMoney(balanceAfterAdvance - tds),
    balancePayableWords: numberToWords(balanceAfterAdvance - tds),
    receipts,
    paymentBankNames: [...new Set(payments.map((p) => (p.bankName ?? '').trim()).filter(Boolean))].join(', '), // the banks the recorded payments came through
    receivedTotal: formatMoney(receivedTotal),
    receivedTotalWords: numberToWords(receivedTotal),
    mcgmCharges: rsText(payables.mcgm),
    commonAreaCharges: payables.commonArea > 0 ? rsText(payables.commonArea) : 'Nil',
    payablesTotal: rsText(payables.total),
    paymentPlanTotalAmount: formatMoney(sum(schedules, (s) => Number(s.principalAmount))),
    paymentPlanTotalGst: formatMoney(sum(schedules, (s) => Number(s.gstAmount))),
    paymentPlanGrandTotal: formatMoney(sum(schedules, (s) => Number(s.principalAmount) + Number(s.gstAmount))),
  }
}

const demandFigures = (s: Pick<Schedule, 'principalAmount' | 'gstAmount'>) => {
  const total = Number(s.principalAmount) + Number(s.gstAmount)
  return { principalAmount: formatMoney(s.principalAmount), gstAmount: formatMoney(s.gstAmount), totalDue: formatMoney(total), amountInWords: numberToWords(total) }
}

/** Where the buyer stands when a demand is raised: what the demand is of the price, what has been paid, and what is still to pay (price and GST separately). */
const demandPosition = (sale: SaleForDocument, schedule: Schedule) => {
  const agreement = Number(sale.agreementValue)
  const payments = sale.paymentSchedules.flatMap((ps) => ps.payments).filter((p) => !p.deletedAt)
  const paid = payments.reduce((total, p) => total + Number(p.amount), 0)
  const gstPaid = payments.reduce((total, p) => total + Number(p.gstPaid), 0)
  const gstTotal = sale.paymentSchedules.reduce((total, ps) => total + Number(ps.gstAmount), 0)
  return {
    percentOfAV: `${agreement > 0 ? Number(((Number(schedule.principalAmount) / agreement) * 100).toFixed(2)) : 0}%`,
    receivedTillDate: formatMoney(paid),
    totalOutstanding: formatMoney(agreement - paid),
    gstOutstanding: formatMoney(gstTotal - gstPaid),
  }
}

/** A sale document about one demand (a demand letter). `schedule` null = nothing is due, the payment tags are left empty. */
export function buildDemandPayload(sale: SaleForDocument, schedule: Schedule | null, partners: PartnerForDocument[] = []) {
  return {
    ...buildSalePayload(sale, partners),
    milestone: schedule ? { name: schedule.milestone?.name ?? schedule.description } : null,
    payment: schedule ? { ...demandFigures(schedule), ...demandPosition(sale, schedule) } : null,
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
