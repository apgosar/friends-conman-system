import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

/** Admin-only guard for the Building Setup APIs. Returns the user, or a ready-made error response. */
export async function requireAdmin() {
  const session = await auth()
  if (!session?.user) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
    return { error: Response.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 }) }
  }
  return { user: session.user }
}

export interface UnitRow {
  category?: 'FLAT' | 'SHOP' | 'OFFICE' | 'COMMON'
  status?: string // defaults to AVAILABLE
  wing: string
  floor: number
  unitNumber: string
  unitTypeId?: string | null
  configuration: string
  carpetAreaSqft: number
  builtupAreaSqft?: number | null
  basePricePerSqft?: number | null
}

export interface CreateResult {
  created: number
  skipped: string[] // unit numbers that already existed in the project
  wingsCreated: number
  floorsCreated: number
}

/**
 * Add wings, floors and units to a project. It only ever ADDS: a wing or floor that already exists is reused,
 * and a unit number that already exists in the project is skipped (never overwritten), so it is safe to run
 * again or to extend a building later.
 */
export async function createUnits(projectId: string, rows: UnitRow[]): Promise<CreateResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.unit.findMany({ where: { floor: { wing: { projectId } } }, select: { unitNumber: true } })
    const taken = new Set(existing.map((u) => u.unitNumber.toLowerCase()))

    const wingIds = new Map<string, string>()
    const floorIds = new Map<string, string>()
    let wingsCreated = 0
    let floorsCreated = 0
    const toCreate: Prisma.UnitCreateManyInput[] = []
    const skipped: string[] = []

    for (const row of rows) {
      if (taken.has(row.unitNumber.toLowerCase())) { skipped.push(row.unitNumber); continue }
      taken.add(row.unitNumber.toLowerCase())

      let wingId = wingIds.get(row.wing.toLowerCase())
      if (!wingId) {
        const found = await tx.wing.findFirst({ where: { projectId, name: { equals: row.wing, mode: 'insensitive' } } })
        if (found) wingId = found.id
        else { wingId = (await tx.wing.create({ data: { projectId, name: row.wing, totalFloors: 0 } })).id; wingsCreated++ }
        wingIds.set(row.wing.toLowerCase(), wingId)
      }

      const floorKey = `${wingId}:${row.floor}`
      let floorId = floorIds.get(floorKey)
      if (!floorId) {
        const found = await tx.floor.findFirst({ where: { wingId, floorNumber: row.floor } })
        if (found) floorId = found.id
        else { floorId = (await tx.floor.create({ data: { wingId, floorNumber: row.floor } })).id; floorsCreated++ }
        floorIds.set(floorKey, floorId)
      }

      toCreate.push({
        floorId,
        unitTypeId: row.unitTypeId ?? null,
        category: row.category ?? 'FLAT',
        unitNumber: row.unitNumber,
        configuration: row.configuration,
        carpetAreaSqft: row.carpetAreaSqft,
        builtupAreaSqft: row.builtupAreaSqft ?? null,
        basePricePerSqft: row.basePricePerSqft ?? null,
        status: row.status ?? 'AVAILABLE',
        statusManual: !!row.status && row.status !== 'AVAILABLE',
      })
    }

    for (let i = 0; i < toCreate.length; i += 500) {
      await tx.unit.createMany({ data: toCreate.slice(i, i + 500) })
    }

    // Wing.totalFloors = how many floors the wing now has
    for (const wingId of wingIds.values()) {
      const count = await tx.floor.count({ where: { wingId } })
      await tx.wing.update({ where: { id: wingId }, data: { totalFloors: count } })
    }

    return { created: toCreate.length, skipped, wingsCreated, floorsCreated }
  }, { timeout: 60_000, maxWait: 10_000 })
}
