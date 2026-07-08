import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      wings: {
        orderBy: { name: 'asc' },
        include: {
          floors: {
            orderBy: { floorNumber: 'desc' }, // top floor first for rendering
            include: {
              units: {
                orderBy: { unitNumber: 'asc' },
                include: {
                  sales: {
                    where: { status: { not: 'CANCELLED' } },
                    select: {
                      id: true,
                      saleNumber: true,
                      status: true,
                      agreementValue: true,
                      buyers: {
                        where: { isPrimary: true },
                        take: 1,
                        select: { fullName: true },
                      },
                    },
                    take: 1,
                  },
                  inquiries: {
                    orderBy: { createdAt: 'desc' },
                  }
                },
              },
            },
          },
        },
      },
    },
  })

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Shape the response for the viewer
  const wings = project.wings.map((wing) => ({
    id: wing.id,
    name: wing.name,
    totalFloors: wing.totalFloors,
    floors: wing.floors.map((floor) => ({
      id: floor.id,
      floorNumber: floor.floorNumber,
      units: floor.units.map((unit) => {
        const sale = unit.sales[0] ?? null
        const inquiries = unit.inquiries ?? []
        return {
          id: unit.id,
          unitNumber: unit.unitNumber,
          configuration: unit.configuration,
          carpetAreaSqft: unit.carpetAreaSqft,
          builtupAreaSqft: unit.builtupAreaSqft,
          status: unit.status,
          saleId: sale?.id ?? null,
          saleNumber: sale?.saleNumber ?? null,
          saleStatus: sale?.status ?? null,
          agreementValue: sale?.agreementValue ?? null,
          buyerName: sale?.buyers[0]?.fullName ?? null,
          inquiries: inquiries.map(inq => ({
            id: inq.id,
            customerName: inq.customerName,
            mobileNumber: inq.mobileNumber,
            totalCost: inq.totalCost,
            createdAt: inq.createdAt,
          })),
        }
      }),
    })),
  }))
  return NextResponse.json({ wings, projectParkingCharge: project.carParkingCharges })
}
