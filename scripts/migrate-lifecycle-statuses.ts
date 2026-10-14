/**
 * One-off: bring existing data in line with the unified status model (lib/status.ts).
 *   1. Remap retired values (PAAA_DONE, POSSESSED, KYC_*, OVERDUE, ...) to their replacements.
 *   2. Re-derive every active sale's status from its dates / payments and mirror it onto the unit.
 *   3. Make sure units without an active sale are Available or Inquiry Received, as the open inquiries dictate.
 *
 * Safe to re-run, and safe on a database that never had the old values. It only re-derives what the
 * app itself derives.
 *
 * Cloud / local:  npx tsx scripts/migrate-lifecycle-statuses.ts
 * On-prem:        nothing to do by hand. The Dockerfile bundles this into the image as
 *                 /app/data-migrations/001-lifecycle-statuses.js and deploy/onprem/update.sh runs it
 *                 once per server, after the new version is healthy.
 */
import { PrismaClient } from '@prisma/client'
import { syncSaleLifecycle } from '../src/lib/sale-lifecycle'

const prisma = new PrismaClient()

async function main() {
  // A bulk remap isn't a user action: don't write (and fail to write) one audit row per sale.
  process.env.NEEV_SKIP_AUDIT = '1'

  // 1. Retired values
  const units = {
    agreement: await prisma.unit.updateMany({ where: { status: 'PAAA_DONE' }, data: { status: 'AGREEMENT_DONE' } }),
    handover: await prisma.unit.updateMany({ where: { status: 'POSSESSED' }, data: { status: 'HANDOVER_COMPLETED' } }),
    sold: await prisma.unit.updateMany({ where: { status: 'SOLD' }, data: { status: 'BOOKED' } }),
  }

  // Signed / possessed sales keep their meaning by getting the matching date (best available: last update)
  const signed = await prisma.sale.findMany({ where: { status: { in: ['DOCUMENT_SIGNED', 'POSSESSION_GIVEN'] } } })
  for (const s of signed) {
    await prisma.sale.update({
      where: { id: s.id },
      data: {
        agreementDate: s.agreementDate ?? s.updatedAt,
        possessionDate: s.status === 'POSSESSION_GIVEN' ? (s.possessionDate ?? s.updatedAt) : s.possessionDate,
      },
    })
  }
  const legacyToBooked = await prisma.sale.updateMany({
    where: { status: { in: ['KYC_PENDING', 'KYC_DONE', 'DOCUMENT_GENERATED', 'ACTIVE', 'REGISTERED'] } },
    data: { status: 'BOOKED' },
  })

  const sched = {
    overdue: await prisma.paymentSchedule.updateMany({ where: { status: 'OVERDUE' }, data: { status: 'OVERDUE_30PLUS' } }),
    partial: await prisma.paymentSchedule.updateMany({ where: { status: 'PARTIAL' }, data: { status: 'PARTIALLY_PAID' } }),
  }

  // 2. Derive sale + unit status for every active sale
  const active = await prisma.sale.findMany({ where: { deletedAt: null, status: { not: 'CANCELLED' } }, select: { id: true } })
  for (const s of active) await syncSaleLifecycle(s.id)

  // 3. Units with no active sale
  const free = await prisma.unit.findMany({
    where: { sales: { none: { deletedAt: null, status: { not: 'CANCELLED' } } } },
    select: { id: true, status: true },
  })
  let released = 0
  for (const u of free) {
    const open = await prisma.inquiry.count({ where: { unitId: u.id, status: 'OPEN' } })
    const want = open > 0 ? 'INQUIRY_RECEIVED' : 'AVAILABLE'
    if (u.status !== want) {
      await prisma.unit.update({ where: { id: u.id }, data: { status: want } })
      released++
    }
  }

  console.log({
    unitsRemapped: units.agreement.count + units.handover.count + units.sold.count,
    salesDatedFromLegacy: signed.length,
    salesReturnedToBooked: legacyToBooked.count,
    schedulesRemapped: sched.overdue.count + sched.partial.count,
    activeSalesRecalculated: active.length,
    unsoldUnitsCorrected: released,
  })
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => {
    await prisma.$disconnect()
    // lib/db keeps its own client open. Don't let it hold the process (and the updater waiting on it) up.
    setTimeout(() => process.exit(0), 3000).unref()
  })
