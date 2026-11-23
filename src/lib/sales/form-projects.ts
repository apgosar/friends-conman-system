import { prisma } from '@/lib/db'
import { pricingFromProject } from '@/lib/pricing'
import type { ParkingValues } from '@/lib/parking'

/**
 * The projects, with what the new sale screen needs of each: the units still for sale, the free parking spaces, the other charges,
 * the payment plans. The edit screen of a sale uses the same, and also lists the sale's own unit and its own parking spaces.
 */
export async function loadSaleFormProjects(own: { unitId?: string; saleId?: string } = {}) {
  const projects = await prisma.project.findMany({
    include: {
      wings: {
        include: {
          floors: {
            include: {
              units: {
                // INQUIRY_RECEIVED units are still unsold, so they must stay selectable
                where: { OR: [{ status: { in: ['AVAILABLE', 'INQUIRY_RECEIVED'] } }, ...(own.unitId ? [{ id: own.unitId }] : [])] }
              }
            }
          }
        }
      },
      tenants: true,
      charges: { orderBy: { sequence: 'asc' } },
      parkingFields: { orderBy: { sequence: 'asc' } },
      // Only the spaces still free: none sold, none allotted outside the app
      parkingSlots: { where: { OR: [{ saleId: null, OR: [{ allottedTo: null }, { allottedTo: '' }] }, ...(own.saleId ? [{ saleId: own.saleId }] : [])] }, orderBy: { sequence: 'asc' } },
      // The construction milestone a possession instalment of a date-based plan is raised on
      milestones: { where: { name: { contains: 'possession', mode: 'insensitive' } }, orderBy: { sequence: 'desc' }, take: 1, select: { id: true, name: true } },
      company: { select: { partners: { where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } } } },
      paymentPlans: {
        orderBy: { name: 'asc' },
        include: { items: { orderBy: { sequence: 'asc' }, include: { milestone: { select: { id: true, name: true, status: true } } } } },
      },
    },
    orderBy: { createdAt: 'desc' }
  })

  return projects.map(p => {
    const units = p.wings.flatMap(w => w.floors.flatMap(f => f.units.map(u => ({
      id: u.id,
      unitNumber: u.unitNumber,
      configuration: u.configuration,
      wingName: w.name,
      floorNumber: f.floorNumber,
      carpetAreaSqft: u.carpetAreaSqft,
      category: u.category,
    }))))
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      carParkingCharges: p.carParkingCharges,
      carParkingIncluded: p.carParkingIncluded,
      charges: p.charges.map((c) => ({ name: c.name, amountType: c.amountType, amount: c.amount, appliesTo: c.appliesTo })), // the other charges, due with the last milestone
      parkingFields: p.parkingFields.map((f) => ({ key: f.key, name: f.name })),
      parkingSlots: p.parkingSlots.map((s) => ({ id: s.id, values: (s.values ?? {}) as ParkingValues, type: s.type })),
      partners: p.company.partners, // the active partners a sale agreement can name
      possessionMilestone: p.milestones[0] ?? null,
      pricing: pricingFromProject(p),
      singleWing: p.singleWing, // no wing name is shown for the project
      units,
      tenants: p.tenants.map(t => ({ id: t.id, name: t.name, oldFlatNumber: t.oldFlatNumber })),
      // The plans a sale can follow: the form picks the default for the sale type and unit type, and lets the user switch
      paymentPlans: p.paymentPlans.map(plan => ({
        id: plan.id,
        name: plan.name,
        saleType: plan.saleType,
        unitType: plan.unitType,
        isDefault: plan.isDefault,
        bookingPercent: plan.bookingPercent,
        items: plan.items.map(i => ({ milestoneId: i.milestone.id, name: i.milestone.name, sequence: i.sequence, percentOfAV: i.percentOfAV, status: i.milestone.status })),
      }))
    }
  })

}
