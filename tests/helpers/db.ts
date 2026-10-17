import { describe } from 'vitest'

export const HAS_DB = !!process.env.TEST_DATABASE_URL

/** `describeDb(...)` is `describe(...)` when TEST_DATABASE_URL is set and `describe.skip(...)` otherwise. */
export const describeDb = HAS_DB ? describe : describe.skip

if (HAS_DB) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
process.env.NEXTAUTH_SECRET ??= 'test-secret-test-secret-test-secret-123'

export async function getPrisma() {
  return (await import('@/lib/db')).prisma
}

/** Empty every table (keeps the schema). Call from beforeEach. */
export async function resetDb() {
  const prisma = await getPrisma()
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (tables.length === 0) return
  const list = tables.map((t) => `"${t.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)
}

let counter = 0
const n = () => ++counter

/** Minimal project > wing > floor > units tree, enough to attach sales to. */
export async function seedProject(opts: { name?: string; units?: number } = {}) {
  const prisma = await getPrisma()
  const project = await prisma.project.create({
    data: {
      name: opts.name ?? `Neev Heights ${n()}`,
      address: 'Road 1', city: 'Mumbai', companyName: 'Test Co', companyAddress: 'Somewhere',
    },
  })
  const wing = await prisma.wing.create({ data: { projectId: project.id, name: 'A', totalFloors: 1 } })
  const floor = await prisma.floor.create({ data: { wingId: wing.id, floorNumber: 1 } })
  const units = []
  for (let i = 0; i < (opts.units ?? 2); i++) {
    units.push(await prisma.unit.create({
      data: { floorId: floor.id, unitNumber: `A-${100 + i + 1}-${n()}`, configuration: '2BHK', carpetAreaSqft: 700 },
    }))
  }
  return { project, wing, floor, units }
}

export async function seedUser(role: 'SUPER_ADMIN' | 'ADMIN' | 'SALES' | 'VIEWER' = 'ADMIN', extra: Record<string, unknown> = {}) {
  const prisma = await getPrisma()
  return prisma.user.create({
    data: { name: `User ${n()}`, email: `user${n()}@example.com`, password: 'x', role, ...extra },
  })
}
