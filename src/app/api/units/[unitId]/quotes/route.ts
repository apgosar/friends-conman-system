import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateAndSaveQuotePdf } from '@/lib/pdf-generator'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ unitId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { unitId } = await params
  
  try {
    const body = await req.json()
    const { customerName, mobileNumber, agreementValue, parkingIncluded } = body

    if (!customerName || !mobileNumber || !agreementValue) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check current unit status and get project parking charge
    const unit = await prisma.unit.findUnique({ 
      where: { id: unitId },
      include: { floor: { include: { wing: { include: { project: true } } } } }
    })
    if (!unit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
    }

    const project = unit.floor.wing.project
    const parkingCharge = parkingIncluded ? (project.carParkingCharges || 0) : 0

    // Calculations based on rules
    const stampDuty = agreementValue * 0.06
    const gst = agreementValue * 0.05
    const registration = parkingIncluded ? 50000 : 30000
    const totalCost = agreementValue + stampDuty + gst + registration + parkingCharge

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
      },
    })

    // Generate PDF synchronously so it is immediately available for download
    await generateAndSaveQuotePdf(inquiry.id)

    return NextResponse.json(inquiry)
  } catch (error: any) {
    console.error('Create quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
