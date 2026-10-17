import { Prisma } from '@prisma/client'
import { transaction } from '@/lib/db'
import { z } from '@/lib/validate'
import { nextSaleNumber } from '@/lib/numbering'
import { buildCommContent, sanitizeInline } from '@/lib/comms-content'
import { computeCharges, pricingFromProject } from '@/lib/pricing'
import { sumRupees } from '@/lib/money'
import { activeSale } from '@/lib/soft-delete'
import { NOT_FOR_SALE_STATUS, UNSOLD_UNIT_STATUSES, unitStatusLabel } from '@/lib/status'
import { redact } from '@/lib/redact'
import { formatDate, formatNumber, formatRupees } from '@/lib/format'

export const SALE_TYPES = ['FRESH', 'REDEVELOPMENT', 'RESALE'] as const

// A non-negative rupee amount, given as a number or a numeric string. NaN / Infinity / negatives are rejected.
const zMoney = z
  .union([z.number(), z.string().trim().min(1).transform(Number)])
  .pipe(z.number().finite('Enter a valid amount').min(0, 'Amount cannot be negative').max(100_000_000_000, 'Amount is too large'))

const SaleBuyerSchema = z.object({
  fullName: z.string().trim().min(1, 'Buyer full name is required').max(200),
  email: z.string().trim().email('Invalid email').optional().nullable().or(z.literal('')),
  whatsappNumber: z.string().optional().nullable(),
  panNumber: z.string().optional().nullable(),
  aadhaarNumber: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  receiveComms: z.boolean().optional(),
})

const PaymentScheduleSchema = z.object({
  milestoneId: z.string().optional().nullable(),
  description: z.string().trim().min(1, 'Milestone description is required').max(200),
  principalAmount: zMoney,
  gstAmount: zMoney.optional().nullable(),
  dueDate: z.string().optional().nullable(),
})

export const SaleCreateSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  unitId: z.string().min(1, 'unitId is required'),
  tenantId: z.string().optional().nullable(),
  saleType: z.enum(SALE_TYPES).optional().default('FRESH'),
  agreementValue: zMoney.pipe(z.number().positive('Agreement value must be greater than zero')),
  gstAmount: zMoney.optional().nullable(),
  stampDuty: zMoney.optional().nullable(),
  registrationCharges: zMoney.optional().nullable(),
  carParking: z.boolean().or(z.string().transform((v) => v === 'true')).optional(),
  carParkingCharges: zMoney.optional().nullable(),
  parkingPodiumLevel: z.string().optional().nullable(),
  parkingFloor: z.string().optional().nullable(),
  parkingNumber: z.string().optional().nullable(),
  bookingAmount: zMoney.optional().nullable(),
  bookingDate: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid bookingDate'),
  buyers: z.array(SaleBuyerSchema).min(1, 'At least one buyer is required'),
  paymentSchedules: z.array(PaymentScheduleSchema).optional(),
  inquiryId: z.string().optional().nullable(), // set when the sale is converted from an inquiry
})

export type SaleCreateInput = z.infer<typeof SaleCreateSchema>

/** A sale could not be created for a reason the user can act on. */
export class SaleError extends Error {
  constructor(message: string, public status: 400 | 404 | 409) {
    super(message)
  }
}

/** Largest amount by which the payment plan may exceed what the buyer owes before it is rejected (rounding slack). */
const PLAN_TOLERANCE_RATIO = 0.01

/**
 * Create a sale. Everything that decides whether the sale is allowed happens inside ONE transaction that holds a lock on
 * the unit, so two people booking the same unit at the same moment cannot both succeed (the second gets a clear 409).
 * The database also enforces it with a unique index on active sales per unit, as a last line of defence.
 */
export async function createSale(input: SaleCreateInput, actorId: string) {
  const sale = await transaction(async (tx) => {
    // 1. Lock the unit row for the rest of this transaction
    await tx.$queryRaw`SELECT id FROM units WHERE id = ${input.unitId} FOR UPDATE`

    const unit = await tx.unit.findUnique({ where: { id: input.unitId }, include: { floor: { include: { wing: true } } } })
    if (!unit) throw new SaleError('Unit not found', 404)
    if (unit.floor.wing.projectId !== input.projectId) throw new SaleError('This unit does not belong to the selected project', 400)
    if (unit.category === 'COMMON' || unit.status === NOT_FOR_SALE_STATUS) throw new SaleError('This area is not for sale', 409)

    const existing = await tx.sale.count({ where: { unitId: unit.id, ...activeSale } })
    if (existing > 0 || !UNSOLD_UNIT_STATUSES.includes(unit.status)) {
      throw new SaleError(`This unit is no longer available (${unitStatusLabel(unit.status)}). Choose another unit.`, 409)
    }

    const project = await tx.project.findUnique({ where: { id: input.projectId } })
    if (!project) throw new SaleError('Project not found', 404)

    // 2. Money. Charges not supplied are computed from the project's own tax settings; values supplied are accepted
    // (a negotiated figure is legitimate) but must be sane, and any difference from the standard is audited.
    const carParking = input.carParking === true
    const standard = computeCharges(pricingFromProject(project), input.agreementValue, carParking)
    const gstAmount = input.gstAmount ?? standard.gst
    const stampDuty = input.stampDuty ?? standard.stampDuty
    const registrationCharges = input.registrationCharges ?? standard.registration
    const parkingCharge = carParking ? (input.carParkingCharges ?? project.carParkingCharges) : 0
    if (stampDuty > input.agreementValue || registrationCharges > input.agreementValue) {
      throw new SaleError('Stamp duty and registration charges cannot be more than the agreement value', 400)
    }

    const schedules = input.paymentSchedules ?? []
    if (schedules.length > 0) {
      const payable = sumRupees([input.agreementValue, stampDuty, registrationCharges, parkingCharge])
      const planned = sumRupees(schedules.map((s) => s.principalAmount))
      if (planned > payable + payable * PLAN_TOLERANCE_RATIO) {
        throw new SaleError(`The payment plan adds up to more than the buyer owes (plan ${formatNumber(planned)}, payable ${formatNumber(payable)}). Check the milestone amounts.`, 400)
      }
    }
    const overrides: Record<string, { standard: number; used: number }> = {}
    for (const [field, used, std] of [['gstAmount', gstAmount, standard.gst], ['stampDuty', stampDuty, standard.stampDuty], ['registrationCharges', registrationCharges, standard.registration]] as const) {
      if (Math.abs(used - std) > 1) overrides[field] = { standard: std, used }
    }

    // 3. The sale itself
    const saleNumber = await nextSaleNumber(tx, project.name)
    const newSale = await tx.sale.create({
      data: {
        saleNumber, projectId: input.projectId, unitId: input.unitId, tenantId: input.tenantId || null,
        saleType: input.saleType,
        agreementValue: input.agreementValue, gstAmount,
        stampDuty: stampDuty || null,
        registrationCharges: registrationCharges || null,
        carParking,
        carParkingCharges: carParking && parkingCharge ? parkingCharge : null,
        parkingPodiumLevel: input.parkingPodiumLevel || null,
        parkingFloor: input.parkingFloor || null,
        parkingNumber: input.parkingNumber || null,
        bookingAmount: input.bookingAmount || null,
        bookingDate: new Date(input.bookingDate), status: 'BOOKED',
      },
    })

    await tx.buyer.createMany({
      data: input.buyers.map((b, i) => ({
        saleId: newSale.id, fullName: b.fullName, email: b.email || null,
        whatsappNumber: b.whatsappNumber || null, panNumber: b.panNumber || null,
        aadhaarNumber: b.aadhaarNumber || null, address: b.address || null,
        isPrimary: i === 0, sequence: i + 1, receiveComms: b.receiveComms !== false,
      })),
    })
    const commBuyers = await tx.buyer.findMany({ where: { saleId: newSale.id, receiveComms: true } })

    // 4. Payment schedule (+ a demand notice for milestones already completed)
    if (schedules.length > 0) {
      const milestoneIds = schedules.map((ps) => ps.milestoneId).filter((id): id is string => !!id)
      const completed = new Map<string, Date | null>()
      if (milestoneIds.length > 0) {
        const done = await tx.constructionMilestone.findMany({
          where: { id: { in: milestoneIds }, projectId: input.projectId, status: 'COMPLETED' },
          select: { id: true, actualDate: true },
        })
        done.forEach((m) => completed.set(m.id, m.actualDate))
      }

      const created = await tx.paymentSchedule.createManyAndReturn({
        data: schedules.map((ps) => {
          const isCompleted = !!ps.milestoneId && completed.has(ps.milestoneId)
          const actualDate = isCompleted ? (completed.get(ps.milestoneId!) || new Date()) : null
          let dueDate = ps.dueDate ? new Date(ps.dueDate) : null
          if (isCompleted && actualDate) {
            dueDate = new Date(actualDate)
            dueDate.setDate(dueDate.getDate() + 14)
          }
          return {
            saleId: newSale.id,
            milestoneId: ps.milestoneId || null,
            description: ps.description,
            principalAmount: ps.principalAmount,
            gstAmount: ps.gstAmount ?? 0,
            dueDate,
            status: isCompleted ? 'DUE' : 'UPCOMING',
            demandGeneratedDate: isCompleted ? new Date() : null,
          }
        }),
      })

      const due = created.filter((s) => s.status === 'DUE' && s.milestoneId)
      if (due.length > 0 && commBuyers.length > 0) {
        const milestones = await tx.constructionMilestone.findMany({
          where: { id: { in: due.map((s) => s.milestoneId!) } },
          select: { id: true, name: true, architectCertificateUrl: true },
        })
        const byId = new Map(milestones.map((m) => [m.id, m]))
        const logs: Prisma.CommunicationLogCreateManyInput[] = []

        for (const schedule of due) {
          const milestone = byId.get(schedule.milestoneId!)
          const amount = schedule.principalAmount + schedule.gstAmount
          const description = schedule.description.toLowerCase()
          const isTaxOrParking = description.includes('stamp duty') || description.includes('registration') || description.includes('parking')
          const dueText = schedule.dueDate ? formatDate(schedule.dueDate) : 'N/A'

          for (const buyer of commBuyers) {
            const greeting = `Dear ${sanitizeInline(buyer.fullName) || 'Customer'},`
            const letter = { label: 'Demand Letter', path: `/api/documents/preview/demand-letter?saleId=${newSale.id}&milestoneName=${encodeURIComponent(isTaxOrParking ? schedule.description : milestone?.name || '')}` }
            const { messageContent, attachments } = isTaxOrParking
              ? buildCommContent(`${greeting}\nPayment for '${sanitizeInline(schedule.description)}' is now due. Please find the attached Demand Letter for ${formatRupees(amount)}.\nDue Date: ${dueText}.`, [letter])
              : buildCommContent(`${greeting}\nThe milestone '${sanitizeInline(milestone?.name)}' is now complete. Please find the attached Demand Letter for ${formatRupees(amount)} and the Architect Completion Certificate.\nDue Date: ${dueText}.`, [{ label: 'Architect Certificate', path: milestone?.architectCertificateUrl || '' }, letter])
            for (const [channel, address] of [['EMAIL', buyer.email], ['WHATSAPP', buyer.whatsappNumber]] as const) {
              if (address) logs.push({ saleId: newSale.id, buyerId: buyer.id, channel, type: 'DEMAND_LETTER', messageContent, attachments, status: 'PENDING' })
            }
          }
        }
        if (logs.length > 0) await tx.communicationLog.createMany({ data: logs })
      }
    }

    // 5. Unit + inquiry
    await tx.unit.update({ where: { id: input.unitId }, data: { status: 'BOOKED', statusManual: false, bookedByName: null, bookedByMobile: null } })
    if (input.inquiryId) {
      await tx.inquiry.updateMany({
        where: { id: input.inquiryId, unitId: input.unitId, status: 'OPEN' },
        data: { status: 'CONVERTED', convertedSaleId: newSale.id },
      })
    }

    // 6. Audit, in the same transaction: no sale without its record, no record for a sale that rolled back
    await tx.auditLog.create({
      data: {
        userId: actorId, projectId: input.projectId, entityType: 'sale', entityId: newSale.id, action: 'created',
        newValues: redact({ saleNumber, saleType: input.saleType, agreementValue: input.agreementValue, unitId: input.unitId, overrides }) as Prisma.InputJsonValue,
      },
    })

    return newSale
  }, { timeout: 30_000, maxWait: 10_000 })

  return sale
}

/** True when the database refused a second active sale on the same unit (the unique index). */
export const isDuplicateActiveSale = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'

