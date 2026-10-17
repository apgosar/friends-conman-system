import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/guard'
import { prisma } from '@/lib/db'

// GET — all inquiries of one unit (loaded when the unit is selected in the building view)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ unitId: string }> }) {
  const guard = await requireRole('staff')
  if ('error' in guard) return guard.error

  const { unitId } = await params
  const inquiries = await prisma.inquiry.findMany({ where: { unitId }, orderBy: { createdAt: 'desc' } })

  return NextResponse.json({
    inquiries: inquiries.map((inq) => ({
      id: inq.id,
      customerName: inq.customerName,
      mobileNumber: inq.mobileNumber,
      totalCost: inq.totalCost,
      status: inq.status,
      email: inq.email,
      source: inq.source,
      sourceDetail: inq.sourceDetail,
      agreementValue: inq.agreementValue,
      parkingIncluded: inq.parkingIncluded,
      validUntil: inq.validUntil,
      lostReason: inq.lostReason,
      lostNote: inq.lostNote,
      lastSharedAt: inq.lastSharedAt,
      lastSharedVia: inq.lastSharedVia,
      convertedSaleId: inq.convertedSaleId,
      createdAt: inq.createdAt,
    })),
  })
}
