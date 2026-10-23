import { formatDate, formatMoney, numberToWords } from '@/lib/format'
import { percentOf, sumRupees } from '@/lib/money'
import { paymentModeLabel } from '@/lib/status'
import { floorLabel, floorOrdinal, ordinal } from '@/lib/building-structure'
import { dateOfDay, interestNote, interestPolicyOf, interestStartDay, standingOfSchedule } from '@/lib/interest'
import { formatPhoneList } from '@/lib/phone'
import { revealPii } from '@/lib/pii' // agreements carry the real numbers; nothing else does
import { computeOtherCharges, rsText, type ChargeItem } from '@/lib/other-charges'

/**
 * The data every document template can use ({{tags}}), built in ONE place for sale agreements, demand letters and
 * receipts. The catalogue shown to users is lib/template-tags.ts: add a tag here and there together.
 */

import type { SaleForDocument, ReceiptPayment, ReceiptSchedule } from './queries'

type Schedule = SaleForDocument['paymentSchedules'][number]

/** Schedules that are asking for money now (a demand letter is about one of these). */
export const DUE_STATUSES = ['DUE', 'OVERDUE_7', 'OVERDUE_15', 'OVERDUE_30', 'OVERDUE_30PLUS']

const SQFT_TO_SQM = 0.092903
/** Names in a line: "A", "A and B", "A, B and C". */
const joinNames = (names: string[]) => {
  const list = names.filter(Boolean)
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : (list[0] ?? '')
}
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
  const paidPrincipal = payments.reduce((total, p) => total + Number(p.amount), 0)
  const receivedTotal = payments.reduce((total, p) => total + Number(p.amount) + Number(p.gstPaid) + Number(p.interestPaid ?? 0), 0)
  const receipts = payments.map((p, i) => ({
    index: i + 1,
    mode: paymentModeLabel(p.mode ?? ''),
    bank: p.bankName ?? '',
    branch: '', // the branch is not recorded with a payment
    reference: p.referenceNumber ?? '',
    date: formatDate(p.paymentDate),
    amount: formatMoney(Number(p.amount) + Number(p.gstPaid) + Number(p.interestPaid ?? 0)),
  }))

  const bookingSchedule = schedules.find((ps) => ps.description.toLowerCase().includes('booking')) ?? schedules[0]
  const bookingAmount = bookingSchedule ? Number(bookingSchedule.principalAmount) : (sale.bookingAmount || 0)
  // The advance named in the agreement is the booking: what has been paid if that is more, else the booking amount agreed
  // (the booking is demanded when the sale is created and may not be recorded as paid yet when the agreement is made)
  const advance = Math.max(paidPrincipal, bookingAmount)
  const tds = percentOf(agreement, project.tdsRatePercent) // what the buyer deducts, at this project's configured rate
  const first = buyers[0]
  const commercial = unit.category === 'SHOP' || unit.category === 'OFFICE'
  // The other charges the sale was made with; a sale from before they were kept is worked out from the project's list now
  const otherCharges: { items: ChargeItem[]; total: number } = Array.isArray(sale.otherCharges)
    ? { items: sale.otherCharges as unknown as ChargeItem[], total: sumRupees((sale.otherCharges as unknown as ChargeItem[]).map((c) => c.amount)) }
    : computeOtherCharges(project.charges ?? [], { carpetAreaSqft: unit.carpetAreaSqft, commercial })
  const buyerNames = joinNames(buyers.map((b) => b.fullName))
  const balanceAfterAdvance = agreement - advance

  return {
    companyName: company.name,
    companyAddress: company.address,
    companyGstin: company.gstin ?? '',
    companyPan: company.panNumber ?? '',
    contactNumbers: formatPhoneList(project.contactNumbers ?? company.contactNumbers), // the project's own, else the company's
    partners: partners.map((p, i) => ({ index: i + 1, ordinal: ordinal(i + 1), name: p.name, address: p.address ?? '', panNumber: revealPii(p.panNumber) })),
    partnerNames: joinNames(partners.map((p) => p.name)), // "A, B and C", for a line that names all the partners
    partner1Name: partners[0]?.name ?? '',
    partner1Address: partners[0]?.address ?? '',
    partner1Pan: revealPii(partners[0]?.panNumber),
    partner2Name: partners[1]?.name ?? '',
    partner2Address: partners[1]?.address ?? '',
    partner2Pan: revealPii(partners[1]?.panNumber),
    projectName: project.name,
    reraNumber: project.reraNumber ?? '',
    wingName: unit.floor.wing.name,
    floorNumber: floorLabel(unit.floor.floorNumber), // G for the ground floor
    floorOrdinal: floorOrdinal(unit.floor.floorNumber), // Ground, 1st, 2nd ...: reads as "on the Ground floor"
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
    otherCharges: otherCharges.items.map((c, i) => ({ index: i + 1, name: c.name, amount: c.text })),
    otherChargesTotal: rsText(otherCharges.total),
    paymentPlanTotalAmount: formatMoney(sum(schedules, (s) => Number(s.principalAmount))),
    paymentPlanTotalGst: formatMoney(sum(schedules, (s) => Number(s.gstAmount))),
    paymentPlanGrandTotal: formatMoney(sum(schedules, (s) => Number(s.principalAmount) + Number(s.gstAmount))),
  }
}

const demandFigures = (s: Pick<Schedule, 'principalAmount' | 'gstAmount'>) => {
  const total = Number(s.principalAmount) + Number(s.gstAmount)
  return { principalAmount: formatMoney(s.principalAmount), gstAmount: formatMoney(s.gstAmount), totalDue: formatMoney(total), amountInWords: numberToWords(total) }
}

/**
 * Where the buyer stands when a demand is raised: what the demand is of the price, what has been paid, and what is
 * still to pay, worked out as the sale page does it. What is due is every demand that is not still upcoming (and this
 * one); what is outstanding is that, less what has been paid, with principal and GST apart. Earlier unpaid demands are
 * therefore already in it, and with none the outstanding is just this demand.
 */
const demandPosition = (sale: SaleForDocument, schedule: Schedule) => {
  const agreement = Number(sale.agreementValue)
  const payments = sale.paymentSchedules.flatMap((ps) => ps.payments).filter((p) => !p.deletedAt)
  const paid = payments.reduce((total, p) => total + Number(p.amount), 0)
  const gstPaid = payments.reduce((total, p) => total + Number(p.gstPaid), 0)

  const raised = sale.paymentSchedules.filter((ps) => ps.status !== 'UPCOMING' || ps.id === schedule.id)
  const principalDue = raised.reduce((total, ps) => total + Number(ps.principalAmount), 0)
  const gstDue = raised.reduce((total, ps) => total + Number(ps.gstAmount ?? 0), 0)
  const outstandingPrincipal = Math.max(0, principalDue - paid)
  const outstandingGst = Math.max(0, gstDue - gstPaid)
  // Interest owed today on the demands raised, and on this one (for the letter)
  const policy = interestPolicyOf(sale.project)
  const outstandingInterest = raised.reduce((total, ps) => total + standingOfSchedule(ps, policy).outstanding, 0)
  const outstanding = outstandingPrincipal + outstandingGst + outstandingInterest
  const own0 = standingOfSchedule(schedule, policy)
  const startDay = interestStartDay({ principalAmount: Number(schedule.principalAmount), dueDate: schedule.dueDate, demandGeneratedDate: schedule.demandGeneratedDate }, policy)
  const showInterest = policy.onDemand === 'ALWAYS' || (policy.onDemand === 'WHEN_ACCRUED' && (own0.accrued > 0 || own0.outstanding > 0))

  // The part of it that belongs to this demand; the rest is carried over from earlier demands
  const own = sale.paymentSchedules.find((ps) => ps.id === schedule.id)
  const ownPaid = (own?.payments ?? []).filter((p) => !p.deletedAt).reduce((total, p) => total + Number(p.amount) + Number(p.gstPaid), 0)
  const ownUnpaid = Math.max(0, Number(schedule.principalAmount) + Number(schedule.gstAmount ?? 0) - ownPaid) + own0.outstanding

  return {
    percentOfAV: `${agreement > 0 ? Number(((Number(schedule.principalAmount) / agreement) * 100).toFixed(2)) : 0}%`,
    receivedTillDate: formatMoney(paid),
    outstandingPrincipal: formatMoney(outstandingPrincipal),
    outstandingGst: formatMoney(outstandingGst),
    totalOutstanding: formatMoney(outstanding),
    gstOutstanding: formatMoney(outstandingGst), // the same as outstandingGst, kept for templates that already use it
    previousOutstanding: formatMoney(Math.max(0, outstanding - ownUnpaid)),
    // Interest on late payment, under the project's settings (see Edit project > Interest)
    outstandingInterest: formatMoney(outstandingInterest),
    interestAccrued: formatMoney(own0.accrued),
    interestOutstanding: formatMoney(own0.outstanding),
    interestRate: `${policy.ratePercent}%`,
    interestStartDate: startDay !== null && policy.enabled ? formatDate(dateOfDay(startDay)) : '',
    interestNote: interestNote(policy, startDay, formatDate),
    showInterest,
    totalPayableWithInterest: formatMoney(Number(schedule.principalAmount) + Number(schedule.gstAmount ?? 0) + own0.outstanding),
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
  const received = Number(payment.amount) + Number(payment.gstPaid ?? 0) + Number(payment.interestPaid ?? 0)

  return {
    ...buildSalePayload(sale),
    milestone: { name: schedule.description },
    payment: demandFigures(schedule),
    receipt: {
      number: payment.receiptNumber ?? `REC-${payment.id.substring(0, 6).toUpperCase()}`,
      date: formatDate(payment.paymentDate),
      principalPaid: formatMoney(payment.amount),
      gstPaid: formatMoney(payment.gstPaid),
      interestPaid: formatMoney(payment.interestPaid ?? 0),
      amount: formatMoney(received),
      amountWords: numberToWords(received),
      mode: paymentModeLabel(payment.mode ?? ''), // "Cheque", "Demand Draft", "NEFT"... as the Record Payment screen names it
      reference: payment.referenceNumber ?? 'N/A',
      bankName: payment.bankName ?? 'N/A',
      cumulativePaid: formatMoney(paidUntilNow),
      balanceOutstanding: formatMoney(totalSaleValue - paidUntilNow),
    },
  }
}

/** Any of the payloads above: what a template renderer needs. */
export type DocumentPayload = ReturnType<typeof buildSalePayload> & Record<string, unknown>
