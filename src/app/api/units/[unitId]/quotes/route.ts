import { apiError, apiServerError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/guard'
import { prisma } from '@/lib/db'
import { generateAndSaveQuotePdf } from '@/lib/pdf-generator'
import { INQUIRY_SOURCES, DEFAULT_QUOTE_VALIDITY_DAYS, addDays, computeQuoteCosts } from '@/lib/inquiry'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ unitId: string }> }
) {
  const guard = await requireRole('staff')
  if ('error' in guard) return guard.error

  const { unitId } = await params
  
  try {
    const body = await req.json()
    const { customerName, mobileNumber, agreementValue, parkingIncluded, email, source, sourceDetail, validityDays } = body
    if (source && !(INQUIRY_SOURCES as readonly string[]).includes(source)) {
      return apiError('invalid', 'Invalid lead source')
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError('invalid', 'Invalid email address')
    }
    const days = Number.isFinite(Number(validityDays)) && Number(validityDays) > 0 ? Number(validityDays) : DEFAULT_QUOTE_VALIDITY_DAYS

    if (!customerName || !mobileNumber || !agreementValue) {
      return apiError('invalid', 'Missing required fields')
    }

    // Check current unit status and get project parking charge
    const unit = await prisma.unit.findUnique({ 
      where: { id: unitId },
      include: { floor: { include: { wing: { include: { project: true } } } } }
    })
    if (!unit) {
      return apiError('notFound', 'Unit not found')
    }

    if (!['AVAILABLE', 'INQUIRY_RECEIVED'].includes(unit.status)) {
      return apiError('conflict', unit.status === 'NOT_FOR_SALE' ? 'This is a common area and is not for sale, so a quote cannot be created for it.' : 'This unit is already sold, so a quote cannot be created for it.')
    }

    const project = unit.floor.wing.project
    const { stampDuty, gst, registration, totalCost } = computeQuoteCosts(agreementValue, !!parkingIncluded, project.carParkingCharges || 0)

    // Update status to INQUIRY_RECEIVED if it's currently AVAILABLE
    if (unit.status === 'AVAILABLE') {
      await prisma.unit.update({
        where: { id: unitId },
        data: { status: 'INQUIRY_RECEIVED' },
      })
    }

    const inquiry = await prisma.inquiry.create({
      data: {
        unitId,
        customerName,
        mobileNumber,
        agreementValue,
        parkingIncluded,
        stampDuty,
        gst,
        registration,
        totalCost,
        email: email || null,
        source: source || null,
        sourceDetail: sourceDetail || null,
        validUntil: addDays(new Date(), days),
      },
    })

    // Generate PDF synchronously so it is immediately available for download
    await generateAndSaveQuotePdf(inquiry.id)

    return NextResponse.json(inquiry)
  } catch (error: any) {
    return apiServerError(error, 'units/[unitId]/quotes')
  }
}
