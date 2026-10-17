import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/guard'
import { prisma } from '@/lib/db'
import { parseBody, z } from '@/lib/validate'
import { generateAndSaveQuotePdf } from '@/lib/pdf-generator'
import { deleteFile } from '@/lib/storage'
import { QUOTE_FOLDER } from '@/lib/storage/files'
import { INQUIRY_SOURCES, LOST_REASONS, computeQuoteCosts, syncUnitInquiryStatus } from '@/lib/inquiry'

const PatchSchema = z.object({
  customerName: z.string().trim().min(1).max(120).optional(),
  mobileNumber: z.string().regex(/^\d{10}$/, 'Mobile must be 10 digits').optional(),
  email: z.string().email().or(z.literal('')).nullable().optional(),
  agreementValue: z.number().positive().optional(),
  parkingIncluded: z.boolean().optional(),
  source: z.enum(INQUIRY_SOURCES).nullable().optional(),
  sourceDetail: z.string().max(120).nullable().optional(),
  validUntil: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid validUntil').optional(),
  // Marking lost / reopening
  status: z.enum(['OPEN', 'LOST']).optional(),
  lostReason: z.enum(LOST_REASONS).optional(),
  lostNote: z.string().max(500).nullable().optional(),
})

type Ctx = { params: Promise<{ unitId: string; quoteId: string }> }

async function loadInquiry(unitId: string, quoteId: string) {
  return prisma.inquiry.findFirst({
    where: { id: quoteId, unitId },
    include: { unit: { include: { floor: { include: { wing: { include: { project: true } } } } } } },
  })
}

// PATCH — fix details, change validity, mark as lost or reopen
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const guard = await requireRole('staff')
  if ('error' in guard) return guard.error

  const { unitId, quoteId } = await params
  const { data, error } = await parseBody(req, PatchSchema)
  if (error) return error

  const inquiry = await loadInquiry(unitId, quoteId)
  if (!inquiry) return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 })
  if (inquiry.status === 'CONVERTED') {
    return NextResponse.json({ error: 'This inquiry has already been converted to a sale and cannot be changed' }, { status: 409 })
  }
  if (data.status === 'LOST' && !data.lostReason) {
    return NextResponse.json({ error: 'A reason is required to mark an inquiry as lost' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (data.customerName !== undefined) update.customerName = data.customerName
  if (data.mobileNumber !== undefined) update.mobileNumber = data.mobileNumber
  if (data.email !== undefined) update.email = data.email || null
  if (data.source !== undefined) update.source = data.source
  if (data.sourceDetail !== undefined) update.sourceDetail = data.sourceDetail || null
  if (data.validUntil !== undefined) update.validUntil = new Date(data.validUntil)

  // Price changes recompute every derived amount
  const pricingChanged = data.agreementValue !== undefined || data.parkingIncluded !== undefined
  if (pricingChanged) {
    const agreementValue = data.agreementValue ?? inquiry.agreementValue
    const parkingIncluded = data.parkingIncluded ?? inquiry.parkingIncluded
    const costs = computeQuoteCosts(agreementValue, parkingIncluded, inquiry.unit.floor.wing.project.carParkingCharges || 0)
    Object.assign(update, { agreementValue, parkingIncluded, ...costs })
  }

  if (data.status === 'LOST') {
    Object.assign(update, { status: 'LOST', lostReason: data.lostReason, lostNote: data.lostNote || null })
  } else if (data.status === 'OPEN') {
    Object.assign(update, { status: 'OPEN', lostReason: null, lostNote: null })
  }

  const updated = await prisma.inquiry.update({ where: { id: quoteId }, data: update })

  // The saved PDF must reflect edited details / pricing / validity
  if (pricingChanged || data.customerName !== undefined || data.mobileNumber !== undefined || data.validUntil !== undefined) {
    await generateAndSaveQuotePdf(quoteId)
  }
  if (data.status !== undefined) await syncUnitInquiryStatus(unitId)

  return NextResponse.json(updated)
}

// DELETE — remove a wrongly entered inquiry (admins only; converted inquiries are kept)
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error

  const { unitId, quoteId } = await params
  const inquiry = await prisma.inquiry.findFirst({ where: { id: quoteId, unitId } })
  if (!inquiry) return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 })
  if (inquiry.status === 'CONVERTED') {
    return NextResponse.json({ error: 'A converted inquiry is linked to a sale and cannot be deleted' }, { status: 409 })
  }

  await prisma.inquiry.delete({ where: { id: quoteId } })
  try {
    await deleteFile(`${QUOTE_FOLDER}/${quoteId}.pdf`)
  } catch {
    // a leftover PDF is harmless
  }
  await syncUnitInquiryStatus(unitId)

  return NextResponse.json({ success: true })
}
