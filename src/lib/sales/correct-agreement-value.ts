/**
 * Correcting a sale's agreement value (Super Admin), for a value entered wrongly. The instalments of the price (booking and
 * milestones) are proposed again in proportion to the new value, with their GST; stamp duty and registration are worked
 * out again from the project's rates. The Super Admin can change any of them before saving. Car parking and other
 * charges do not depend on the value and are left alone. Saving is all or nothing, is audited, and can send each buyer a
 * revised demand letter for every demand already raised that still has something to pay.
 */

import type { Prisma } from '@prisma/client'
import { z } from '@/lib/validate'
import { prisma, transaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { activeSale } from '@/lib/soft-delete'
import { fromPaise, toPaise } from '@/lib/money'
import { computeCharges, pricingFromProject } from '@/lib/pricing'
import { STAMP_DUTY_LABEL, isStandaloneCharge } from '@/lib/payment-plans'
import { getOverdueBucket } from '@/lib/interest'
import { syncAccruals } from '@/lib/interest-ledger'
import { syncSaleLifecycle } from '@/lib/sale-lifecycle'
import { buildCommContent, sanitizeInline } from '@/lib/comms-content'
import { formatCurrency, formatDate, formatRupees } from '@/lib/format'

/** A demand that is part of the price: the booking and the milestone instalments (not stamp duty, parking or other charges). */
export const isPriceInstalment = (description: string) => !isStandaloneCharge(description)

export interface InstalmentRow {
  scheduleId: string
  description: string
  status: string
  raised: boolean
  oldPrincipal: number
  oldGst: number
  principalPaid: number
  gstPaid: number
  newPrincipal: number
  newGst: number
}

export interface CorrectionProposal {
  oldAgreementValue: number
  newAgreementValue: number
  oldStampDuty: number
  oldRegistration: number
  stampDuty: number
  registration: number
  rows: InstalmentRow[]
  /** Whether the instalments added up to the agreement value before: they must then add up to the new one */
  instalmentsMatchValue: boolean
}

/** What the proposal reads of a sale (money columns arrive as numbers or Decimals, so they are read through Number()). */
interface SaleForCorrection {
  agreementValue: unknown
  stampDuty: unknown
  registrationCharges: unknown
  carParking: boolean
  carParkingIncluded: boolean
  project: Parameters<typeof pricingFromProject>[0]
  paymentSchedules: {
    id: string; description: string; status: string; demandGeneratedDate: Date | null; principalAmount: unknown; gstAmount: unknown
    payments: { amount: unknown; gstPaid: unknown; deletedAt: Date | null }[]
  }[]
}

const live = <T extends { deletedAt: Date | null }>(rows: T[]) => rows.filter((r) => !r.deletedAt)

/**
 * The new amounts, in paise arithmetic: each instalment scaled by new value / old value (its GST at the same rate as
 * before), the rounding left over put on the last instalment, so they still add up to the value when they did before.
 */
export function proposeCorrection(sale: SaleForCorrection, newAgreementValue: number): CorrectionProposal {
  const oldAV = toPaise(Number(sale.agreementValue))
  const newAV = toPaise(newAgreementValue)
  const rows: InstalmentRow[] = sale.paymentSchedules.filter((s) => isPriceInstalment(s.description)).map((s) => {
    const payments = live(s.payments)
    const oldPrincipal = toPaise(Number(s.principalAmount))
    const oldGst = toPaise(Number(s.gstAmount))
    const newPrincipal = oldAV > 0 ? Math.round((oldPrincipal * newAV) / oldAV) : oldPrincipal
    return {
      scheduleId: s.id, description: s.description, status: s.status, raised: !!s.demandGeneratedDate,
      oldPrincipal, oldGst,
      principalPaid: payments.reduce((t, p) => t + toPaise(Number(p.amount)), 0),
      gstPaid: payments.reduce((t, p) => t + toPaise(Number(p.gstPaid)), 0),
      newPrincipal,
      newGst: oldPrincipal > 0 ? Math.round((oldGst * newPrincipal) / oldPrincipal) : 0,
    }
  })
  const oldTotal = rows.reduce((t, r) => t + r.oldPrincipal, 0)
  const instalmentsMatchValue = rows.length > 0 && Math.abs(oldTotal - oldAV) <= 100 // within a rupee
  if (instalmentsMatchValue) {
    const last = rows[rows.length - 1]
    const gap = newAV - rows.reduce((t, r) => t + r.newPrincipal, 0)
    if (gap !== 0 && last.oldPrincipal > 0) {
      last.newGst = Math.round((last.oldGst * (last.newPrincipal + gap)) / last.oldPrincipal)
      last.newPrincipal += gap
    }
  }

  const separateParking = sale.carParking && !sale.carParkingIncluded
  const standard = computeCharges(pricingFromProject(sale.project), newAgreementValue, separateParking)
  return {
    oldAgreementValue: fromPaise(oldAV), newAgreementValue: fromPaise(newAV),
    oldStampDuty: Number(sale.stampDuty ?? 0), oldRegistration: Number(sale.registrationCharges ?? 0),
    stampDuty: standard.stampDuty, registration: standard.registration,
    rows: rows.map((r) => ({ ...r, oldPrincipal: fromPaise(r.oldPrincipal), oldGst: fromPaise(r.oldGst), principalPaid: fromPaise(r.principalPaid), gstPaid: fromPaise(r.gstPaid), newPrincipal: fromPaise(r.newPrincipal), newGst: fromPaise(r.newGst) })),
    instalmentsMatchValue,
  }
}

export async function loadSaleForCorrection(saleId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, ...activeSale },
    include: { project: true, paymentSchedules: { include: { payments: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
  })
  if (!sale) throw fail('notFound', 'Sale not found, or it has been cancelled')
  return sale
}

const money = z.number().finite().min(0, 'Amounts cannot be negative').max(100_000_000_000, 'The amount is too large')

export const CorrectionSchema = z.object({
  agreementValue: money.positive('Enter the correct agreement value'),
  stampDuty: money,
  registration: money,
  rows: z.array(z.object({ scheduleId: z.string().min(1), principalAmount: money, gstAmount: money })).max(100),
  reason: z.string().trim().min(3, 'Say why the agreement value is being corrected').max(500),
  sendRevisedLetters: z.boolean().default(true),
})
export type CorrectionInput = z.infer<typeof CorrectionSchema>

/** Check a correction against the sale; returns the first problem in plain words, or null. */
export function checkCorrection(proposal: CorrectionProposal, input: CorrectionInput): string | null {
  const byId = new Map(proposal.rows.map((r) => [r.scheduleId, r]))
  if (input.rows.length !== proposal.rows.length || input.rows.some((r) => !byId.has(r.scheduleId))) {
    return 'The demands of this sale have changed since the screen was opened. Close it and start again'
  }
  if (toPaise(input.agreementValue) === toPaise(proposal.oldAgreementValue)) return 'The new agreement value is the same as the current one'
  for (const r of input.rows) {
    const row = byId.get(r.scheduleId)!
    if (toPaise(r.principalAmount) < toPaise(row.principalPaid)) return `${row.description}: ${formatRupees(row.principalPaid)} has already been received, so it cannot be less than that`
    if (toPaise(r.gstAmount) < toPaise(row.gstPaid)) return `${row.description}: GST of ${formatRupees(row.gstPaid)} has already been received, so it cannot be less than that`
  }
  const total = input.rows.reduce((t, r) => t + toPaise(r.principalAmount), 0)
  const value = toPaise(input.agreementValue)
  if (proposal.instalmentsMatchValue && Math.abs(total - value) > 100) {
    return `The instalments add up to ${formatRupees(fromPaise(total))}, not the agreement value of ${formatRupees(input.agreementValue)}`
  }
  if (total > value + 100) return `The instalments add up to ${formatRupees(fromPaise(total))}, more than the agreement value of ${formatRupees(input.agreementValue)}`
  if (input.stampDuty > input.agreementValue || input.registration > input.agreementValue) return 'Stamp duty and registration charges cannot be more than the agreement value'
  return null
}

/** The status of an instalment once its amount changed: Paid when what was received covers it, else as it stands. */
function statusAfterCorrection(s: { status: string; demandGeneratedDate: Date | null; dueDate: Date | null }, cleared: boolean, anyPaid: boolean, asOf: Date) {
  if (cleared) return 'PAID'
  if (!s.demandGeneratedDate) return 'UPCOMING' // not raised yet: billed when its milestone completes
  return getOverdueBucket(s.dueDate, s.demandGeneratedDate, anyPaid ? 'PARTIALLY_PAID' : 'DUE', asOf)
}

/** Save a correction. Returns how many demands changed and how many revised letters were queued. */
export async function applyCorrection(saleId: string, input: CorrectionInput, actorId: string) {
  const asOf = new Date()
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales WHERE id = ${saleId} FOR UPDATE`
    const sale = await tx.sale.findFirst({
      where: { id: saleId, ...activeSale },
      include: { project: true, unit: { select: { unitNumber: true } }, paymentSchedules: { include: { payments: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    })
    if (!sale) throw fail('notFound', 'Sale not found, or it has been cancelled')
    const proposal = proposeCorrection(sale, input.agreementValue)
    const problem = checkCorrection(proposal, input)
    if (problem) throw fail('invalid', problem)

    const byId = new Map(sale.paymentSchedules.map((s) => [s.id, s]))
    const changed: { id: string; description: string; balance: number; dueDate: Date | null; raised: boolean; status: string }[] = []
    for (const r of input.rows) {
      const s = byId.get(r.scheduleId)!
      const row = proposal.rows.find((x) => x.scheduleId === r.scheduleId)!
      if (toPaise(r.principalAmount) === toPaise(row.oldPrincipal) && toPaise(r.gstAmount) === toPaise(row.oldGst)) continue
      const interestOwed = toPaise(Number(s.interestAmount))
      const balance = toPaise(r.principalAmount) - toPaise(row.principalPaid) + toPaise(r.gstAmount) - toPaise(row.gstPaid)
      const status = statusAfterCorrection(s, balance <= 0 && interestOwed <= 0, row.principalPaid + row.gstPaid > 0, asOf)
      await tx.paymentSchedule.update({ where: { id: s.id }, data: { principalAmount: r.principalAmount, gstAmount: r.gstAmount, status } })
      if (s.demandGeneratedDate) await syncAccruals(tx, s.id, asOf) // interest runs on the corrected principal
      changed.push({ id: s.id, description: s.description, balance: fromPaise(balance), dueDate: s.dueDate, raised: !!s.demandGeneratedDate, status })
    }

    // Stamp duty and registration: on the sale, and on their demand line when there is one
    const stamp = sale.paymentSchedules.find((s) => s.description === STAMP_DUTY_LABEL)
    if (stamp) await tx.paymentSchedule.update({ where: { id: stamp.id }, data: { principalAmount: fromPaise(toPaise(input.stampDuty) + toPaise(input.registration)) } })

    const gstTotal = fromPaise(input.rows.reduce((t, r) => t + toPaise(r.gstAmount), 0))
    const oldValues = { agreementValue: Number(sale.agreementValue), gstAmount: Number(sale.gstAmount), stampDuty: Number(sale.stampDuty ?? 0), registrationCharges: Number(sale.registrationCharges ?? 0) }
    const newValues = { agreementValue: input.agreementValue, gstAmount: proposal.rows.length > 0 ? gstTotal : Number(sale.gstAmount), stampDuty: input.stampDuty, registrationCharges: input.registration }
    await tx.sale.update({
      where: { id: sale.id },
      data: { agreementValue: newValues.agreementValue, gstAmount: newValues.gstAmount, stampDuty: input.stampDuty || null, registrationCharges: input.registration || null },
    })
    await syncSaleLifecycle(sale.id, tx)

    // Revised demand letters for what was already demanded and is still to pay
    let letters = 0
    if (input.sendRevisedLetters) {
      const buyers = await tx.buyer.findMany({ where: { saleId: sale.id, receiveComms: true }, orderBy: { sequence: 'asc' } })
      const logs: Prisma.CommunicationLogCreateManyInput[] = []
      for (const d of changed.filter((c) => c.raised && c.balance > 0)) {
        const letter = { label: 'Revised Demand Letter', path: `/api/documents/preview/demand-letter?saleId=${sale.id}&milestoneName=${encodeURIComponent(d.description)}` }
        for (const buyer of buyers) {
          const { messageContent, attachments } = buildCommContent(
            `Dear ${sanitizeInline(buyer.fullName) || 'Customer'},\nThis is a revised demand. Payment for '${sanitizeInline(d.description)}' is now due as per the attached revised Demand Letter for ${formatCurrency(d.balance)}.\nThe agreement value of unit ${sanitizeInline(sale.unit.unitNumber)} has been corrected, and this letter replaces the earlier one.\nDue Date: ${d.dueDate ? formatDate(d.dueDate) : formatDate(asOf)}.`,
            [letter],
          )
          for (const [channel, address] of [['EMAIL', buyer.email], ['WHATSAPP', buyer.whatsappNumber]] as const) {
            if (address) logs.push({ saleId: sale.id, buyerId: buyer.id, channel, type: 'DEMAND_LETTER', messageContent, attachments, status: 'PENDING' })
          }
        }
      }
      if (logs.length > 0) await tx.communicationLog.createMany({ data: logs })
      letters = logs.length
    }

    await tx.auditLog.create({
      data: {
        userId: actorId, projectId: sale.projectId, entityType: 'sale', entityId: sale.id, action: 'agreement_value_corrected',
        oldValues: oldValues as Prisma.InputJsonValue,
        newValues: { ...newValues, reason: input.reason, demandsChanged: changed.length, revisedLetters: letters } as Prisma.InputJsonValue,
      },
    })
    return { demandsChanged: changed.length, letters }
  }, { timeout: 30_000, maxWait: 10_000 })
}
