import { it, expect, beforeEach, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'
import { SaleCreateSchema } from '@/lib/sales/create-sale'

const buyer = { fullName: 'Asha Rao', email: 'asha@example.com', whatsappNumber: '9876543210', panNumber: 'ABCDE1234F', aadhaarNumber: '1234 5678 9012', address: '12 MG Road, Pune' }
const saleInput = (projectId: string, unitId: string, over: Record<string, unknown> = {}) =>
  SaleCreateSchema.parse({ projectId, unitId, agreementValue: 10_000_000, bookingDate: '2026-10-01', buyers: [buyer], ...over })

// The route is called as the signed-in user the guard returns (setup() makes that user, so the audit entries have someone to point at)
let actorId = 'u1'
const asRole = (role: string) => vi.doMock('@/lib/guard', () => ({
  requireRole: async (min: string) => (role === 'SUPER_ADMIN' || (role === 'ADMIN' && min !== 'superadmin') ? { user: { id: actorId, role } } : { error: new Response(JSON.stringify({ error: 'no' }), { status: 403 }) }),
}))

async function setup(units = 2) {
  const prisma = await getPrisma()
  const user = await seedUser('SUPER_ADMIN')
  actorId = user.id
  const { project, units: u } = await seedProject({ name: 'Neev Heights', units })
  await prisma.parkingField.createMany({ data: [{ projectId: project.id, name: 'Level', key: 'level', sequence: 0 }, { projectId: project.id, name: 'Number', key: 'number', sequence: 1 }] })
  const slot = (n: number, over: Record<string, unknown> = {}) => prisma.parkingSlot.create({ data: { projectId: project.id, values: { level: 'P-1', number: String(n) }, uniqueKey: `level=p-1|number=${n}`, sequence: n, ...over } })
  return { prisma, user, project, units: u, slot }
}

describeDb('selling parking spaces', () => {
  beforeEach(async () => { await resetDb(); vi.resetModules() })

  it('links the chosen spaces to the sale and fills its older parking text', async () => {
    const { createSale } = await import('@/lib/sales/create-sale')
    const { prisma, user, project, units, slot } = await setup()
    const [a, b] = [await slot(1), await slot(2)]
    const sale = await createSale(saleInput(project.id, units[0].id, { carParkingCount: 2, parkingSlotIds: [a.id, b.id] }), user.id)
    expect((await prisma.parkingSlot.findMany({ where: { saleId: sale.id } })).map((s) => s.id).sort()).toEqual([a.id, b.id].sort())
    expect(await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).toMatchObject({ parkingPodiumLevel: 'P-1, P-1', parkingNumber: '1, 2' })
  })

  it('refuses a space that is sold, allotted outside the app, or not in this project, and books nothing', async () => {
    const { createSale } = await import('@/lib/sales/create-sale')
    const { prisma, user, project, units, slot } = await setup()
    const first = await slot(1)
    await createSale(saleInput(project.id, units[0].id, { carParkingCount: 1, parkingSlotIds: [first.id] }), user.id)

    const allotted = await slot(2, { allottedTo: 'SHOP 05' })
    const other = await seedProject({ name: 'Other', units: 1 })
    const foreign = await prisma.parkingSlot.create({ data: { projectId: other.project.id, values: { level: 'P-1', number: '9' }, uniqueKey: 'x' } })
    for (const id of [first.id, allotted.id, foreign.id]) {
      await expect(createSale(saleInput(project.id, units[1].id, { carParkingCount: 1, parkingSlotIds: [id] }), user.id)).rejects.toMatchObject({ status: 409 })
    }
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: units[1].id } })).status).toBe('AVAILABLE') // the sale rolled back
    expect(await prisma.sale.count()).toBe(1)
  })

  it('asks for one space per car park', async () => {
    const { createSale } = await import('@/lib/sales/create-sale')
    const { user, project, units, slot } = await setup()
    const a = await slot(1)
    await expect(createSale(saleInput(project.id, units[0].id, { carParkingCount: 2, parkingSlotIds: [a.id] }), user.id)).rejects.toMatchObject({ status: 409, message: /all 2 parking spaces/ })
  })

  it('gives a space to only one of two sales made at the same moment', async () => {
    const { createSale } = await import('@/lib/sales/create-sale')
    const { prisma, user, project, units, slot } = await setup()
    const s = await slot(1)
    const results = await Promise.allSettled(units.map((u) => createSale(saleInput(project.id, u.id, { carParkingCount: 1, parkingSlotIds: [s.id] }), user.id)))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.sale.count()).toBe(1)
    expect((await prisma.parkingSlot.findUniqueOrThrow({ where: { id: s.id } })).saleId).not.toBeNull()
  })

  it('frees the spaces when the sale is deleted', async () => {
    const { createSale } = await import('@/lib/sales/create-sale')
    const { softDelete } = await import('@/lib/soft-delete')
    const { prisma, user, project, units, slot } = await setup()
    const s = await slot(1)
    const sale = await createSale(saleInput(project.id, units[0].id, { carParkingCount: 1, parkingSlotIds: [s.id] }), user.id)
    await softDelete.sale(sale.id, { userId: user.id })
    expect((await prisma.parkingSlot.findUniqueOrThrow({ where: { id: s.id } })).saleId).toBeNull()
    await createSale(saleInput(project.id, units[1].id, { carParkingCount: 1, parkingSlotIds: [s.id] }), user.id) // and it can be sold again
  })
})

const params = (id: string, slotId?: string) => ({ params: Promise.resolve({ id, slotId: slotId ?? '' }) })
const json = (method: string, body: unknown) => new Request('http://x', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as never

describeDb('parking details and spaces', () => {
  beforeEach(async () => { await resetDb(); vi.resetModules() })

  it('keeps the tag of a renamed detail, and will not remove a detail that spaces use', async () => {
    asRole('ADMIN')
    const { PUT } = await import('@/app/api/projects/[id]/parking/fields/route')
    const { prisma, project, slot } = await setup()
    await slot(1)
    expect((await PUT(json('PUT', { fields: [{ name: 'Podium level', key: 'level' }, { name: 'Number', key: 'number' }] }), params(project.id))).status).toBe(200)
    expect((await prisma.parkingField.findMany({ where: { projectId: project.id }, orderBy: { sequence: 'asc' } })).map((f) => [f.name, f.key])).toEqual([['Podium level', 'level'], ['Number', 'number']])

    const res = await PUT(json('PUT', { fields: [{ name: 'Podium level', key: 'level' }] }), params(project.id)) // drops Number, which the space uses
    expect(res.status).toBe(409)
    expect(await prisma.parkingField.count({ where: { projectId: project.id } })).toBe(2)
    expect((await PUT(json('PUT', { fields: [{ name: 'Index' }] }), params(project.id))).status).toBe(400)
  })

  it('adds spaces, refuses a repeat, and will not remove a sold space', async () => {
    asRole('ADMIN')
    const { POST } = await import('@/app/api/projects/[id]/parking/slots/route')
    const { DELETE } = await import('@/app/api/projects/[id]/parking/slots/[slotId]/route')
    const { prisma, project, units, user } = await setup()
    const run = Array.from({ length: 3 }, (_, i) => ({ values: { level: 'G', number: String(i + 1) }, type: 'Stack Parking' }))
    expect((await POST(json('POST', { slots: run }), params(project.id))).status).toBe(201)
    expect((await POST(json('POST', { slots: [{ values: { level: ' g ', number: '2' } }] }), params(project.id))).status).toBe(409)
    expect(await prisma.parkingSlot.count()).toBe(3)

    const { createSale } = await import('@/lib/sales/create-sale')
    const [first] = await prisma.parkingSlot.findMany({ orderBy: { sequence: 'asc' } })
    await createSale(saleInput(project.id, units[0].id, { carParkingCount: 1, parkingSlotIds: [first.id] }), user.id)
    expect((await DELETE(json('DELETE', {}), params(project.id, first.id))).status).toBe(409)
  })

  it('is for an Admin: a Sales user cannot add or import', async () => {
    asRole('SALES')
    const { POST } = await import('@/app/api/projects/[id]/parking/slots/route')
    const { project } = await setup()
    expect((await POST(json('POST', { slots: [{ values: { number: '1' } }] }), params(project.id))).status).toBe(403)
  })
})

/** The sheet from the screenshot: two stacked tables, each with a merged title row */
async function sheetFile(): Promise<File> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  const block = (title: string, rows: (string | number)[][]) => {
    const t = ws.addRow([title]); ws.mergeCells(t.number, 1, t.number, 4)
    ws.addRow(['Parking no', 'Type of parking', 'Attoted to', 'Regestraed Y/N'])
    rows.forEach((r) => ws.addRow(r))
    ws.addRow([])
  }
  block('Ground Floor Parking', [[1, 'Stack Parking'], [2, 'Stack Parking'], [3, 'Stack Parking', 'SHOP 05', 'YES']])
  block('P -1 1st Floor Parking', [[1, 'Surface Parking'], [2, 'Surface Parking', 'Bharati Gda', 'YES']])
  return new File([await wb.xlsx.writeBuffer() as ArrayBuffer], 'parking.xlsx')
}
const form = (file: File, mapping?: unknown) => {
  const f = new FormData()
  f.append('file', file)
  if (mapping) f.append('mapping', JSON.stringify(mapping))
  return new Request('http://x', { method: 'POST', body: f }) as never
}

describeDb('importing a parking sheet', () => {
  beforeEach(async () => { await resetDb(); vi.resetModules() })
  const mapping = { columns: { 'parking no': 'field:number', 'type of parking': 'type', 'attoted to': 'allottedTo', 'regestraed y/n': 'registered' }, title: 'field:level' }

  it('reads the sheet first, then imports with the column choices; a second run adds nothing', async () => {
    asRole('SUPER_ADMIN')
    const { POST } = await import('@/app/api/projects/[id]/parking/import/route')
    const { prisma, project } = await setup()
    const file = await sheetFile()

    const preview = await (await POST(form(file), params(project.id))).json()
    expect(preview.preview.blocks.map((b: { title: string; rows: number }) => [b.title, b.rows])).toEqual([['Ground Floor Parking', 3], ['P -1 1st Floor Parking', 2]])
    expect(preview.preview.columns.map((c: { suggested: string }) => c.suggested)).toEqual(['field:number', 'type', 'allottedTo', 'registered'])
    expect(await prisma.parkingSlot.count()).toBe(0) // reading saves nothing

    const done = await POST(form(file, mapping), params(project.id))
    expect(done.status).toBe(201)
    expect(await done.json()).toMatchObject({ created: 5, skipped: 0 })
    const slots = await prisma.parkingSlot.findMany({ orderBy: { sequence: 'asc' } })
    expect(slots.map((s) => [(s.values as Record<string, string>).level, (s.values as Record<string, string>).number, s.allottedTo, s.registered])).toEqual([
      ['Ground Floor Parking', '1', null, false], ['Ground Floor Parking', '2', null, false], ['Ground Floor Parking', '3', 'SHOP 05', true],
      ['P -1 1st Floor Parking', '1', null, false], ['P -1 1st Floor Parking', '2', 'Bharati Gda', true],
    ])

    expect(await (await POST(form(file, mapping), params(project.id))).json()).toMatchObject({ created: 0, skipped: 5 })
    expect(await prisma.parkingSlot.count()).toBe(5)
  })

  it('can replace a list imported the wrong way, and keeps a space a sale holds', async () => {
    asRole('SUPER_ADMIN')
    const { POST } = await import('@/app/api/projects/[id]/parking/import/route')
    const { prisma, project, units, user } = await setup()
    const file = await sheetFile()
    await POST(form(file, mapping), params(project.id)) // the whole title went into Level
    const { createSale } = await import('@/lib/sales/create-sale')
    const free = await prisma.parkingSlot.findFirstOrThrow({ where: { allottedTo: null }, orderBy: { sequence: 'asc' } })
    await createSale(saleInput(project.id, units[0].id, { carParkingCount: 1, parkingSlotIds: [free.id] }), user.id)

    await prisma.parkingField.create({ data: { projectId: project.id, name: 'Floor', key: 'floor', sequence: 2 } })
    const titled = { columns: mapping.columns, title: 'ignore', replace: true, titleValues: { 'ground floor parking': { floor: 'Ground', level: '-' }, 'p -1 1st floor parking': { floor: '1st', level: 'P1' } } }
    expect(await (await POST(form(file, titled), params(project.id))).json()).toMatchObject({ created: 5, removed: 4 })
    const all = await prisma.parkingSlot.findMany({ orderBy: { sequence: 'asc' } })
    expect(all).toHaveLength(6) // the 4 not sold went; the sold one stayed (its old values), and 5 came in
    expect(all.filter((s) => (s.values as Record<string, string>).floor === '1st').map((s) => (s.values as Record<string, string>).level)).toEqual(['P1', 'P1'])
    expect(all.some((s) => s.id === free.id && s.saleId)).toBe(true)
  })

  it('imports nothing when a row is wrong', async () => {
    asRole('SUPER_ADMIN')
    const { POST } = await import('@/app/api/projects/[id]/parking/import/route')
    const { prisma, project } = await setup()
    const res = await POST(form(await sheetFile(), { columns: mapping.columns, title: 'ignore' }), params(project.id)) // number only: Ground 1 and P-1 1 collide
    expect(res.status).toBe(400)
    expect((await res.json()).totalErrors).toBeGreaterThan(0)
    expect(await prisma.parkingSlot.count()).toBe(0)
  })

  it('is for a Super Admin only', async () => {
    asRole('ADMIN')
    const { POST } = await import('@/app/api/projects/[id]/parking/import/route')
    const { project } = await setup()
    expect((await POST(form(await sheetFile()), params(project.id))).status).toBe(403)
  })
})
