import type { DbTransaction } from '@/lib/db'
import { legacyParkingTexts, type ParkingValues } from '@/lib/parking'

/**
 * A new sale takes the parking spaces the person chose. Runs inside the sale's transaction: each space is claimed only if it is still
 * free (no sale, nothing allotted outside the app), so two sales made at the same moment cannot both get one. The sale's three older
 * parking text fields are filled from the spaces, so everything that still reads them keeps working.
 * Returns a message for the person when the choice cannot be honoured, otherwise null.
 */
export async function claimParkingSlots(
  tx: DbTransaction,
  opts: { projectId: string; saleId: string; slotIds: string[]; count: number },
): Promise<string | null> {
  const ids = [...new Set(opts.slotIds)]
  if (ids.length !== opts.count) return `Choose ${opts.count === 1 ? 'the parking space' : `all ${opts.count} parking spaces`} for this sale`

  const claimed = await tx.parkingSlot.updateMany({
    where: { id: { in: ids }, projectId: opts.projectId, saleId: null, OR: [{ allottedTo: null }, { allottedTo: '' }] },
    data: { saleId: opts.saleId },
  })
  if (claimed.count !== ids.length) return 'A parking space you chose is no longer available. Choose again'

  const slots = await tx.parkingSlot.findMany({ where: { id: { in: ids } }, orderBy: { sequence: 'asc' } })
  const texts = legacyParkingTexts(slots.map((s) => ({ values: (s.values ?? {}) as ParkingValues })))
  await tx.sale.update({ where: { id: opts.saleId }, data: { parkingPodiumLevel: texts.podiumLevel || null, parkingFloor: texts.floor || null, parkingNumber: texts.number || null } })
  return null
}
