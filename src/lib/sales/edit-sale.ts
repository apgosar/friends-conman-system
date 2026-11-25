/**
 * Editing a sale after it was made (administrators). Everything the new sale screens ask can be changed: the unit (another
 * one of the same project that is still free), the buyers, the price and charges, the parking and the payment plan.
 *
 * What is already settled stays settled: a demand that has had payments cannot be removed or made smaller than what was
 * received, and a buyer's saved PAN or Aadhaar is kept when it is left blank. Saving is all or nothing and audited, and can send
 * each buyer a revised demand letter for every raised demand that changed and still has something to pay.
 */

import type { Prisma } from '@prisma/client'
import { z } from '@/lib/validate'
import { transaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { activeSale } from '@/lib/soft-delete'
import { fromPaise, sumRupees, toPaise } from '@/lib/money'
import { GST_RATE_OPTIONS, computeCharges, pricingFromProject } from '@/lib/pricing'
import { dueDateAfter } from '@/lib/payment-plans'
import { computeOtherCharges } from '@/lib/other-charges'
import { getOverdueBucket } from '@/lib/interest'
import { syncAccruals } from '@/lib/interest-ledger'
import { syncSaleLifecycle } from '@/lib/sale-lifecycle'
import { claimParkingSlots } from '@/lib/parking-sale'
import { NOT_FOR_SALE_STATUS, UNSOLD_UNIT_STATUSES, unitStatusLabel } from '@/lib/status'
import { isAnonymized } from '@/lib/dpdp-compliance'
import { PAN_ERROR, PAN_PATTERN } from '@/lib/companies'
import { buildCommContent, sanitizeInline } from '@/lib/comms-content'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { PLAN_TOLERANCE_RATIO, PaymentScheduleSchema, SALE_TYPES, checkDatedRows, SaleBuyerSchema, requirePrimaryContact, zMoney } from '@/lib/sales/create-sale'

const EditBuyerSchema = SaleBuyerSchema.extend({
  id: z.string().optional(), // set for a buyer the sale already has
  // A buyer the sale already has keeps the PAN saved (it is never sent to the screen) when this is left blank
  panNumber: z.string().trim().toUpperCase().refine((v) => v === '' || PAN_PATTERN.test(v), PAN_ERROR).optional(),
})

export const SaleEditSchema = z.object({
  unitId: z.string().min(1, 'Choose a unit'),
  tenantId: z.string().optional().nullable(),
  saleType: z.enum(SALE_TYPES).default('FRESH'),
  agreementValue: zMoney.pipe(z.number().positive('Agreement value must be greater than zero')),
  gstAmount: zMoney.optional().nullable(),
  stampDuty: zMoney.optional().nullable(),
  registrationCharges: zMoney.optional().nullable(),
  gstRatePercent: z.number().refine((v) => (GST_RATE_OPTIONS as readonly number[]).includes(v), 'Choose a GST rate from the list').optional(),
  carParkingCount: z.number().int().min(0).max(20).optional(),
  carParkingCharges: zMoney.optional().nullable(),
  parkingPodiumLevel: z.string().optional().nullable(),
  parkingFloor: z.string().optional().nullable(),
  parkingNumber: z.string().optional().nullable(),
  parkingSlotIds: z.array(z.string().min(1)).max(20).optional(),
  bookingAmount: zMoney.optional().nullable(),
  bookingDate: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid bookingDate'),
  buyers: z.array(EditBuyerSchema).min(1, 'At least one buyer is required').superRefine(requirePrimaryContact),
  paymentSchedules: z.array(PaymentScheduleSchema.extend({ id: z.string().optional() })).max(100).superRefine(checkDatedRows),
  reason: z.string().trim().min(3, 'Say why the sale is being changed').max(500),
  sendRevisedLetters: z.boolean().default(true),
})
export type SaleEditInput = z.infer<typeof SaleEditSchema>

/** The status of a demand once its amount changed: Paid when what was received covers it, else as it stands. */
function statusAfterEdit(s: { demandGeneratedDate: Date | null; dueDate: Date | null }, cleared: boolean, anyPaid: boolean, asOf: Date) {
  if (cleared) return 'PAID'
  if (!s.demandGeneratedDate) return 'UPCOMING' // not raised yet: billed when its milestone completes
  return getOverdueBucket(s.dueDate, s.demandGeneratedDate, anyPaid ? 'PARTIALLY_PAID' : 'DUE', asOf)
}

const live = <T extends { deletedAt: Date | null }>(rows: T[]) => rows.filter((r) => !r.deletedAt)

export async function updateSale(saleId: string, input: SaleEditInput, actorId: string) {
  const asOf = new Date()
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales WHERE id = ${saleId} FOR UPDATE`
    const sale = await tx.sale.findFirst({
      where: { id: saleId, ...activeSale },
      include: { project: true, unit: true, buyers: { orderBy: { sequence: 'asc' } }, paymentSchedules: { include: { payments: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    })
    if (!sale) throw fail('notFound', 'Sale not found, or it has been cancelled')
    if (sale.status === 'CANCELLED') throw fail('invalid', 'A cancelled sale cannot be edited')
    const project = sale.project

    // 1. The unit: another one of the same project that is still free. The old one goes back on sale.
    let unit = sale.unit
    if (input.unitId !== sale.unitId) {
      await tx.$queryRaw`SELECT id FROM units WHERE id = ${input.unitId} FOR UPDATE`
      const next = await tx.unit.findUnique({ where: { id: input.unitId }, include: { floor: { include: { wing: true } } } })
      if (!next) throw fail('notFound', 'Unit not found')
      if (next.floor.wing.projectId !== sale.projectId) throw fail('invalid', 'Choose a unit of the same project')
      if (next.category === 'COMMON' || next.status === NOT_FOR_SALE_STATUS) throw fail('conflict', 'This area is not for sale')
      if ((await tx.sale.count({ where: { unitId: next.id, ...activeSale } })) > 0 || !UNSOLD_UNIT_STATUSES.includes(next.status)) {
        throw fail('conflict', `This unit is no longer available (${unitStatusLabel(next.status)}). Choose another unit`)
      }
      await tx.unit.update({ where: { id: sale.unitId }, data: { status: 'AVAILABLE', statusManual: false, bookedByName: null, bookedByMobile: null } })
      unit = next
    }

    // 2. Money
    const carParkingCount = input.carParkingCount ?? 0
    const carParking = carParkingCount > 0
    const parkingIncluded = carParking && project.carParkingIncluded
    const pricing = { ...pricingFromProject(project), ...(input.gstRatePercent !== undefined ? { gstRatePercent: input.gstRatePercent } : {}) }
    const standard = computeCharges(pricing, input.agreementValue, carParking && !parkingIncluded)
    const gstAmount = input.gstAmount ?? standard.gst
    const stampDuty = input.stampDuty ?? standard.stampDuty
    const registrationCharges = input.registrationCharges ?? standard.registration
    const parkingCharge = carParking && !parkingIncluded ? (input.carParkingCharges ?? project.carParkingCharges * carParkingCount) : 0
    if (stampDuty > input.agreementValue || registrationCharges > input.agreementValue) throw fail('invalid', 'Stamp duty and registration charges cannot be more than the agreement value')
    const projectCharges = await tx.projectCharge.findMany({ where: { projectId: sale.projectId }, orderBy: { sequence: 'asc' } })
    const other = computeOtherCharges(projectCharges, { carpetAreaSqft: unit.carpetAreaSqft, commercial: unit.category === 'SHOP' || unit.category === 'OFFICE' })
    const rows = input.paymentSchedules
    if (rows.length > 0) {
      const payable = sumRupees([input.agreementValue, stampDuty, registrationCharges, parkingCharge, other.total])
      const planned = sumRupees(rows.map((r) => r.principalAmount))
      if (planned > payable + payable * PLAN_TOLERANCE_RATIO) {
        throw fail('invalid', `The payment plan adds up to more than the buyer owes (plan ${formatNumber(planned)}, payable ${formatNumber(payable)}). Check the milestone amounts`)
      }
    }

    // 3. Parking: the spaces chosen are taken (the ones this sale had are freed first, so keeping one is fine)
    await tx.parkingSlot.updateMany({ where: { saleId: sale.id }, data: { saleId: null } })
    if (input.parkingSlotIds?.length) {
      const refused = await claimParkingSlots(tx, { projectId: sale.projectId, saleId: sale.id, slotIds: input.parkingSlotIds, count: carParkingCount })
      if (refused) throw fail('conflict', refused)
    }

    // 4. Buyers: the first is the primary. Existing ones are updated, new ones added, the others removed.
    const buyerIds = new Set(sale.buyers.map((b) => b.id))
    if (input.buyers.some((b) => b.id && !buyerIds.has(b.id))) throw fail('invalid', 'The buyers of this sale have changed since the screen was opened. Close it and start again')
    if (input.buyers.some((b) => !b.id && !b.panNumber)) throw fail('invalid', 'Enter the PAN number')
    const kept = new Set(input.buyers.flatMap((b) => (b.id ? [b.id] : [])))
    for (const gone of sale.buyers.filter((b) => !kept.has(b.id))) {
      await tx.communicationLog.updateMany({ where: { buyerId: gone.id }, data: { buyerId: null } })
      await tx.kycDocument.deleteMany({ where: { buyerId: gone.id } })
      await tx.buyer.delete({ where: { id: gone.id } })
    }
    for (const [i, b] of input.buyers.entries()) {
      const common = { sequence: i + 1, isPrimary: i === 0 }
      if (b.id) {
        const current = sale.buyers.find((x) => x.id === b.id)!
        if (isAnonymized(current.fullName)) { await tx.buyer.update({ where: { id: b.id }, data: common }); continue } // erased data is never written back
        await tx.buyer.update({
          where: { id: b.id },
          data: {
            ...common, fullName: b.fullName, email: b.email || null, whatsappNumber: b.whatsappNumber || null, address: b.address || null,
            receiveComms: i === 0 ? true : b.receiveComms ?? current.receiveComms, // the primary buyer is always contacted
            ...(b.panNumber && { panNumber: b.panNumber }),
            ...(b.aadhaarNumber && { aadhaarNumber: b.aadhaarNumber }),
          },
        })
      } else {
        await tx.buyer.create({
          data: {
            saleId: sale.id, ...common, fullName: b.fullName, email: b.email || null, whatsappNumber: b.whatsappNumber || null,
            panNumber: b.panNumber || null, aadhaarNumber: b.aadhaarNumber || null, address: b.address || null, receiveComms: i === 0 || b.receiveComms !== false,
          },
        })
      }
    }

    // 5. Demands: a row the screen sends with an id is changed, one without is added, one it no longer sends is removed
    const existing = new Map(sale.paymentSchedules.map((s) => [s.id, s]))
    if (rows.some((r) => r.id && !existing.has(r.id))) throw fail('invalid', 'The demands of this sale have changed since the screen was opened. Close it and start again')
    const sentIds = new Set(rows.flatMap((r) => (r.id ? [r.id] : [])))
    const sentNames = rows.map((r) => r.description.trim().toLowerCase())
    if (rows.some((r) => r.autoRaise && sentNames.filter((n) => n === r.description.trim().toLowerCase()).length > 1)) throw fail('invalid', 'Each demand needs a different name')
    for (const s of sale.paymentSchedules.filter((x) => !sentIds.has(x.id))) {
      if (live(s.payments).length > 0) throw fail('invalid', `"${s.description}" has payments recorded, so it cannot be removed`)
      await tx.paymentSchedule.delete({ where: { id: s.id } })
    }

    const changed: { description: string; balance: number; dueDate: Date | null; raised: boolean }[] = []
    const completedIds = new Map((await tx.constructionMilestone.findMany({ where: { projectId: sale.projectId, status: 'COMPLETED' }, select: { id: true, actualDate: true } })).map((m) => [m.id, m.actualDate]))
    for (const r of rows) {
      const principalPaise = toPaise(r.principalAmount)
      const gstPaise = toPaise(r.gstAmount ?? 0)
      if (r.id) {
        const s = existing.get(r.id)!
        const payments = live(s.payments)
        const principalPaid = payments.reduce((t, p) => t + toPaise(Number(p.amount)), 0)
        const gstPaid = payments.reduce((t, p) => t + toPaise(Number(p.gstPaid)), 0)
        if (principalPaise < principalPaid) throw fail('invalid', `${s.description}: ${formatCurrency(fromPaise(principalPaid))} has already been received, so it cannot be less than that`)
        if (gstPaise < gstPaid) throw fail('invalid', `${s.description}: GST of ${formatCurrency(fromPaise(gstPaid))} has already been received, so it cannot be less than that`)
        // A demand not raised yet can change from milestone-based to date-based (or back) with the plan type; one already raised never does
        if (!s.demandGeneratedDate && (r.autoRaise === true) !== s.autoRaise) {
          await tx.paymentSchedule.update({ where: { id: s.id }, data: { autoRaise: r.autoRaise === true, raiseOn: r.autoRaise && r.raiseOn ? new Date(r.raiseOn) : null, milestoneId: r.autoRaise ? null : r.milestoneId || null } })
          s.autoRaise = r.autoRaise === true
          s.raiseOn = r.autoRaise && r.raiseOn ? new Date(r.raiseOn) : null
        }
        // A date-based demand that is not raised yet can have its date changed too
        const newRaiseOn = s.autoRaise && !s.demandGeneratedDate && r.raiseOn ? new Date(r.raiseOn) : null
        const dateMoved = !!newRaiseOn && newRaiseOn.getTime() !== s.raiseOn?.getTime()
        if (dateMoved) await tx.paymentSchedule.update({ where: { id: s.id }, data: { raiseOn: newRaiseOn } })
        if (principalPaise === toPaise(Number(s.principalAmount)) && gstPaise === toPaise(Number(s.gstAmount))) continue
        const balance = principalPaise - principalPaid + gstPaise - gstPaid
        const status = statusAfterEdit(s, balance <= 0 && toPaise(Number(s.interestAmount)) <= 0, principalPaid + gstPaid > 0, asOf)
        await tx.paymentSchedule.update({ where: { id: s.id }, data: { principalAmount: r.principalAmount, gstAmount: r.gstAmount ?? 0, status } })
        if (s.demandGeneratedDate) await syncAccruals(tx, s.id, asOf) // interest runs on the new principal
        changed.push({ description: s.description, balance: fromPaise(balance), dueDate: s.dueDate, raised: !!s.demandGeneratedDate })
      } else {
        const done = !!r.milestoneId && completedIds.has(r.milestoneId)
        const actualDate = done ? completedIds.get(r.milestoneId!) || asOf : null
        const dueDate = done && actualDate ? dueDateAfter(actualDate, project.demandDueDays) : r.dueDate ? new Date(r.dueDate) : null
        await tx.paymentSchedule.create({
          data: {
            saleId: sale.id, milestoneId: r.milestoneId || null, description: r.description, principalAmount: r.principalAmount, gstAmount: r.gstAmount ?? 0, dueDate,
            raiseOn: r.autoRaise && r.raiseOn ? new Date(r.raiseOn) : null, autoRaise: r.autoRaise === true,
            status: done ? 'DUE' : 'UPCOMING', demandGeneratedDate: done ? asOf : null,
          },
        })
        if (done) changed.push({ description: r.description, balance: fromPaise(principalPaise + gstPaise), dueDate, raised: true })
      }
    }

    // 6. The sale itself
    const old = { unitId: sale.unitId, agreementValue: Number(sale.agreementValue), gstAmount: Number(sale.gstAmount), stampDuty: Number(sale.stampDuty ?? 0), registrationCharges: Number(sale.registrationCharges ?? 0), carParkingCount: sale.carParkingCount, buyers: sale.buyers.length }
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        unitId: input.unitId, tenantId: input.saleType === 'REDEVELOPMENT' ? input.tenantId || null : null, saleType: input.saleType,
        agreementValue: input.agreementValue, gstAmount, stampDuty: stampDuty || null, registrationCharges: registrationCharges || null,
        carParking, carParkingCount, carParkingIncluded: parkingIncluded, carParkingCharges: parkingCharge || null,
        otherCharges: other.items.length > 0 ? (other.items as unknown as Prisma.InputJsonValue) : undefined,
        bookingAmount: input.bookingAmount || null, bookingDate: new Date(input.bookingDate),
        // Without a parking list the three texts are what was typed; with one, claimParkingSlots filled them
        ...(input.parkingSlotIds?.length ? {} : { parkingPodiumLevel: input.parkingPodiumLevel || null, parkingFloor: input.parkingFloor || null, parkingNumber: input.parkingNumber || null }),
      },
    })
    await syncSaleLifecycle(sale.id, tx)

    // 7. Revised demand letters for what was already demanded, changed and still to pay (only while the sale sends messages)
    let letters = 0
    if (input.sendRevisedLetters && sale.commsEnabled) {
      const buyers = await tx.buyer.findMany({ where: { saleId: sale.id, receiveComms: true }, orderBy: { sequence: 'asc' } })
      const logs: Prisma.CommunicationLogCreateManyInput[] = []
      for (const d of changed.filter((c) => c.raised && c.balance > 0)) {
        const letter = { label: 'Revised Demand Letter', path: `/api/documents/preview/demand-letter?saleId=${sale.id}&milestoneName=${encodeURIComponent(d.description)}` }
        for (const buyer of buyers) {
          const { messageContent, attachments } = buildCommContent(
            `Dear ${sanitizeInline(buyer.fullName) || 'Customer'},\nThis is a revised demand. Payment for '${sanitizeInline(d.description)}' is now due as per the attached revised Demand Letter for ${formatCurrency(d.balance)}.\nThe details of unit ${sanitizeInline(unit.unitNumber)} have been corrected, and this letter replaces the earlier one.\nDue Date: ${d.dueDate ? formatDate(d.dueDate) : formatDate(asOf)}.`,
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
        userId: actorId, projectId: sale.projectId, entityType: 'sale', entityId: sale.id, action: 'sale_edited',
        oldValues: old as Prisma.InputJsonValue,
        newValues: { unitId: input.unitId, agreementValue: input.agreementValue, gstAmount, stampDuty, registrationCharges, carParkingCount, buyers: input.buyers.length, reason: input.reason, demandsChanged: changed.length, revisedLetters: letters } as Prisma.InputJsonValue,
      },
    })
    return { demandsChanged: changed.length, letters }
  }, { timeout: 30_000, maxWait: 10_000 })
}
