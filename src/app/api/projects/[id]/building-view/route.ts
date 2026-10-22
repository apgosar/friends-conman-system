import { route, fail } from '@/lib/route'
import { prisma } from '@/lib/db'
import { activeSale } from '@/lib/soft-delete'

const EXPIRY_WARNING_DAYS = 3

// GET — everything the building view needs to draw the project, kept deliberately small:
// per-unit inquiry COUNTS and flags only. The full inquiry list for a unit is fetched when it is selected
// (/api/units/[unitId]/inquiries), so the payload doesn't grow as inquiries pile up.
export const GET = route<{ id: string }>('any', async ({ params }) => {
  const { id } = params

  const [project, inquiryRows] = await Promise.all([
    prisma.project.findUnique({
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
                    unitType: { select: { floorPlanUrl: true } },
                    sales: {
                      where: activeSale,
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
                  },
                },
              },
            },
          },
        },
      },
    }),
    // Just the few columns needed for counts, expiry flags and repeat-customer detection
    prisma.inquiry.findMany({
      where: { unit: { floor: { wing: { projectId: id } } } },
      select: { unitId: true, mobileNumber: true, status: true, validUntil: true },
    }),
  ])

  if (!project) throw fail('notFound', 'Project not found')

  const soon = Date.now() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000
  const perUnit = new Map<string, { total: number; open: number; expiring: boolean }>()
  const perMobile = new Map<string, number>()
  for (const q of inquiryRows) {
    const u = perUnit.get(q.unitId) ?? { total: 0, open: 0, expiring: false }
    u.total++
    if (q.status === 'OPEN') {
      u.open++
      if (q.validUntil && q.validUntil.getTime() < soon) u.expiring = true // expired, or about to
    }
    perUnit.set(q.unitId, u)
    perMobile.set(q.mobileNumber, (perMobile.get(q.mobileNumber) ?? 0) + 1)
  }
  // Only mobiles that appear more than once matter (repeat customers)
  const repeatMobiles = Object.fromEntries([...perMobile].filter(([, n]) => n > 1))

  // Shape the response for the viewer
  const wings = project.wings.map((wing) => ({
    id: wing.id,
    name: wing.name,
    totalFloors: wing.totalFloors,
    floors: wing.floors.filter((floor) => floor.units.length > 0).map((floor) => ({
      id: floor.id,
      floorNumber: floor.floorNumber,
      units: floor.units.map((unit) => {
        const sale = unit.sales[0] ?? null
        const counts = perUnit.get(unit.id)
        return {
          id: unit.id,
          unitNumber: unit.unitNumber,
          configuration: unit.configuration,
          category: unit.category,
          carpetAreaSqft: unit.carpetAreaSqft,
          builtupAreaSqft: unit.builtupAreaSqft,
          floorPlanUrl: unit.unitType?.floorPlanUrl ?? null,
          status: unit.status,
          saleId: sale?.id ?? null,
          saleNumber: sale?.saleNumber ?? null,
          saleStatus: sale?.status ?? null,
          agreementValue: sale?.agreementValue ?? null,
          buyerName: sale?.buyers[0]?.fullName ?? null,
          bookedByName: unit.bookedByName,
          bookedByMobile: unit.bookedByMobile,
          inquiryCount: counts?.total ?? 0,
          openInquiries: counts?.open ?? 0,
          quoteExpiring: counts?.expiring ?? false,
        }
      }),
    })),
  }))
  return Response.json({ wings, projectParkingCharge: project.carParkingCharges, projectParkingIncluded: project.carParkingIncluded, repeatMobiles })
})
