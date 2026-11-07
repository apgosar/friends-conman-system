import { it, expect, beforeEach, vi } from 'vitest'
import PizZip from 'pizzip'
import { NextRequest } from 'next/server'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'
import { SaleCreateSchema } from '@/lib/sales/create-sale'
import { buildSampleDocx } from '@/lib/template-sample'

// Storage is an in-memory map, so the generated letters can be read back
const files = vi.hoisted(() => new Map<string, Buffer>())
vi.mock('@/lib/storage', async (orig) => ({
  ...(await orig<typeof import('@/lib/storage')>()),
  uploadFile: async ({ buffer, folder, fileName }: { buffer: Buffer; folder: string; fileName: string }) => {
    const key = `${folder}/${fileName}`
    files.set(key, Buffer.from(buffer))
    return `/api/files/${encodeURIComponent(key)}`
  },
  downloadFile: async (key: string) => {
    const found = files.get(key)
    if (!found) throw Object.assign(new Error('not found'), { code: 'ENOENT' })
    return found
  },
}))

// The templates route also reads the session for its GET; the POST tested here goes through the guard below
vi.mock('@/lib/auth', () => ({ auth: async () => null }))

// The route is called as the signed-in user the guard returns
let actorId = 'u1'
const RANK: Record<string, string[]> = { SUPER_ADMIN: ['viewer', 'staff', 'admin', 'superadmin'], ADMIN: ['viewer', 'staff', 'admin'], SALES: ['viewer', 'staff'], VIEWER: ['viewer'] }
const asRole = (role: string) => vi.doMock('@/lib/guard', () => ({
  requireRole: async (min: string) => (RANK[role].includes(min) ? { user: { id: actorId, role } } : { error: new Response(JSON.stringify({ error: 'no' }), { status: 403 }) }),
}))

const ADDRESS = '7-C/34, Shree Jawahar CHS LTD, Sodawala Lane, Opp. Balwant Society, Govind Nagar Borivali (W) - 400092.'
const buyer = { fullName: 'Hiral Sanghavi', email: 'h@example.com', whatsappNumber: '9876543210', panNumber: 'ABCDE1234F', address: ADDRESS }

const docxWith = (text: string) => {
  const zip = new PizZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:body></w:document>`)
  return zip.generate({ type: 'nodebuffer' })
}
const upload = (name: string, buffer: Buffer) => {
  const form = new FormData()
  form.set('type', 'POSSESSION_LETTER')
  form.set('name', name)
  form.set('file', new File([new Uint8Array(buffer)], `${name}.docx`, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
  return new NextRequest('http://x/api/projects/p/templates', { method: 'POST', body: form })
}
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) })
const json = (body: unknown) => new NextRequest('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function setup() {
  const prisma = await getPrisma()
  const user = await seedUser('SUPER_ADMIN')
  actorId = user.id
  const { project, units } = await seedProject({ name: 'Jai Dena', units: 2 })
  const { createSale } = await import('@/lib/sales/create-sale')
  const sale = await createSale(SaleCreateSchema.parse({ projectId: project.id, unitId: units[0].id, agreementValue: 10_000_000, bookingDate: '2026-10-01', buyers: [buyer] }), user.id)
  return { prisma, project, sale, units, user }
}

describeDb('possession documents', () => {
  beforeEach(async () => { await resetDb(); vi.resetModules(); files.clear(); asRole('SUPER_ADMIN') })

  it('keeps several possession templates active, each with its own versions', async () => {
    const { prisma, project } = await setup()
    const { POST } = await import('@/app/api/projects/[id]/templates/route')
    const docx = await buildSampleDocx('POSSESSION_LETTER')
    for (const name of ['Handover letter', 'Gas NOC', 'Gas NOC']) expect((await POST(upload(name, docx), params({ id: project.id }))).status).toBe(200)

    const rows = await prisma.template.findMany({ where: { projectId: project.id }, orderBy: [{ name: 'asc' }, { version: 'asc' }] })
    expect(rows.map((t) => [t.name, t.version, t.isActive])).toEqual([['Gas NOC', 1, false], ['Gas NOC', 2, true], ['Handover letter', 1, true]])
  })

  it('makes every active possession document for a fully paid sale, and none before', async () => {
    const { prisma, project, sale } = await setup()
    const { POST: uploadTemplate } = await import('@/app/api/projects/[id]/templates/route')
    await uploadTemplate(upload('Handover letter', docxWith('{{buyer1AddressLines}}|{{agreementDate}}|{{unitNumber}}')), params({ id: project.id }))
    await uploadTemplate(upload('Gas NOC', docxWith('{{#buyers}}{{fullName}}{{/buyers}}')), params({ id: project.id }))
    const { POST } = await import('@/app/api/documents/generate/route')

    const early = await POST(json({ saleId: sale.id, type: 'POSSESSION_LETTER' }), params({}))
    expect(early.status).toBe(400)
    expect((await early.json()).error).toMatch(/every payment/)

    await prisma.sale.update({ where: { id: sale.id }, data: { status: 'ALL_PAID', agreementDate: new Date(2024, 3, 15) } })
    const res = await POST(json({ saleId: sale.id, type: 'POSSESSION_LETTER' }), params({}))
    expect(res.status).toBe(200)
    const made = (await res.json()).data as { id: string; pdfUrl: string; template: { name: string } }[]
    expect(made.map((d) => d.template.name).sort()).toEqual(['Gas NOC', 'Handover letter'])

    const handover = made.find((d) => d.template.name === 'Handover letter')!
    const xml = new PizZip(files.get(decodeURIComponent(handover.pdfUrl.replace('/api/files/', '')))!).file('word/document.xml')!.asText()
    expect(xml.match(/<w:br\/>/g)).toHaveLength(2) // the address is on three lines
    expect(xml).toContain('Sodawala Lane, Opp. Balwant Society,')
    expect(xml).toContain('15th April 2024')

    // ...and they download together
    const { GET } = await import('@/app/api/sales/[id]/documents/zip/route')
    const zipRes = await GET(new NextRequest(`http://x/api/sales/${sale.id}/documents/zip?ids=${made.map((d) => d.id).join(',')}`), params({ id: sale.id }))
    expect(zipRes.status).toBe(200)
    expect(zipRes.headers.get('content-type')).toBe('application/zip')
    const names = Object.keys(new PizZip(Buffer.from(await zipRes.arrayBuffer())).files).sort()
    expect(names).toEqual([`Gas NOC - ${sale.saleNumber}.docx`, `Handover letter - ${sale.saleNumber}.docx`])
  })

  it('says a template is needed when the project has none', async () => {
    const { prisma, sale } = await setup()
    await prisma.sale.update({ where: { id: sale.id }, data: { status: 'ALL_PAID' } })
    const { POST } = await import('@/app/api/documents/generate/route')
    expect((await POST(json({ saleId: sale.id, type: 'POSSESSION_LETTER' }), params({}))).status).toBe(404)
  })

  it('zips only the documents of the sale named, for staff only', async () => {
    const { prisma, project, sale, units, user } = await setup()
    const { createSale } = await import('@/lib/sales/create-sale')
    const other = await createSale(SaleCreateSchema.parse({ projectId: project.id, unitId: units[1].id, agreementValue: 10_000_000, bookingDate: '2026-10-01', buyers: [buyer] }), user.id)
    const doc = await prisma.document.create({ data: { saleId: other.id, type: 'POSSESSION_LETTER', status: 'GENERATED', pdfUrl: '/api/files/documents%2Fx.docx' } })
    const { GET } = await import('@/app/api/sales/[id]/documents/zip/route')
    expect((await GET(new NextRequest(`http://x/?ids=${doc.id}`), params({ id: sale.id }))).status).toBe(404)

    vi.resetModules(); asRole('VIEWER')
    const { GET: asViewer } = await import('@/app/api/sales/[id]/documents/zip/route')
    expect((await asViewer(new NextRequest(`http://x/?ids=${doc.id}`), params({ id: other.id }))).status).toBe(403)
  })

  it('lets only an admin generate them', async () => {
    const { prisma, sale } = await setup()
    await prisma.sale.update({ where: { id: sale.id }, data: { status: 'ALL_PAID' } })
    vi.resetModules(); asRole('SALES')
    const { POST } = await import('@/app/api/documents/generate/route')
    expect((await POST(json({ saleId: sale.id, type: 'POSSESSION_LETTER' }), params({}))).status).toBe(403)
  })
})
