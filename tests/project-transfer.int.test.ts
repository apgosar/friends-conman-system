import { it, expect, beforeEach, vi } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'
import { decryptPii, isEncryptedPii } from '@/lib/pii'

// Storage is an in-memory map: what the app keeps as files, and what a project file brings across, can be compared exactly.
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
  deleteFile: async (key: string) => { files.delete(key) },
}))

const PASS = 'a long passphrase for tests'
const url = (key: string) => `/api/files/${encodeURIComponent(key)}`
const put = (key: string, text: string) => { files.set(key, Buffer.from(text)); return url(key) }

async function* pieces(bytes: Buffer, size = 50_000) { for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size) }

async function lib() {
  const exporter = await import('@/lib/project-transfer/export')
  const importer = await import('@/lib/project-transfer/import')
  const pkg = await import('@/lib/project-transfer/package')
  return { ...exporter, ...importer, ...pkg }
}

/** A project that touches every table that travels. */
async function seedRich() {
  const prisma = await getPrisma()
  const waiverUser = await seedUser('ADMIN', { email: 'waiver@example.com' })
  const company = await prisma.company.create({ data: { name: 'Neev Builders', address: 'Andheri', panNumber: 'AAAPN1234C', letterheadUrl: put('letterheads/lh.png', 'letterhead') } })
  const asha = await prisma.partner.create({ data: { companyId: company.id, name: 'Asha Shah', panNumber: 'ABCPS1234D' } })
  const ravi = await prisma.partner.create({ data: { companyId: company.id, name: 'Ravi Mehta', panNumber: 'ABCPM1234E', isActive: false } })
  const project = await prisma.project.create({
    data: { name: 'Neev Court', address: 'Road 1', city: 'Mumbai', companyId: company.id, type: 'MIXED', interestRatePercent: 14.5, regChargesCap: 45000, paymentPlanOptOuts: ['REDEVELOPMENT:COMMERCIAL'], carParkingCharges: 650000.5 },
  })
  const unitType = await prisma.unitType.create({ data: { projectId: project.id, name: '2BHK-A', configuration: '2BHK', carpetAreaSqft: 700.5, floorPlanUrl: put('floor-plans/ut.png', 'unit type plan') } })
  const wing = await prisma.wing.create({ data: { projectId: project.id, name: 'A', totalFloors: 2 } })
  const floor = await prisma.floor.create({ data: { wingId: wing.id, floorNumber: 1, floorPlanUrl: put('floor-plans/f1.png', 'floor plan') } })
  const [u1, u2, u3] = await Promise.all(['A-101', 'A-102', 'A-103'].map((unitNumber, i) =>
    prisma.unit.create({ data: { floorId: floor.id, unitNumber, configuration: '2BHK', carpetAreaSqft: 700, unitTypeId: i === 0 ? unitType.id : null, status: i === 0 ? 'BOOKED' : 'AVAILABLE' } })))
  await prisma.parkingField.create({ data: { projectId: project.id, name: 'Level', key: 'level', sequence: 1 } })
  const milestone = await prisma.constructionMilestone.create({ data: { projectId: project.id, name: 'Plinth', sequence: 1, status: 'COMPLETED', architectCertificateUrl: put('uploads/cert.pdf', 'architect certificate') } })
  const plan = await prisma.paymentPlan.create({ data: { projectId: project.id, name: 'Standard', saleType: 'FRESH', unitType: 'RESIDENTIAL', isDefault: true, bookingPercent: 10 } })
  await prisma.paymentPlanItem.create({ data: { planId: plan.id, milestoneId: milestone.id, sequence: 1, percentOfAV: 30 } })
  await prisma.projectCharge.create({ data: { projectId: project.id, name: 'Legal', amountType: 'FIXED', amount: 15000.25, appliesTo: 'BOTH' } })
  const template = await prisma.template.create({ data: { projectId: project.id, type: 'SALE_AGREEMENT', name: 'Agreement', fileUrl: put('uploads/agreement-template.docx', 'template'), templateHtml: '<p>{{buyer}}</p>' } })
  await prisma.tenant.create({ data: { projectId: project.id, name: 'Old tenant', oldFlatNumber: '7', oldAreaSqft: 300, newUnitId: u3.id } })
  const inquiry = await prisma.inquiry.create({ data: { unitId: u2.id, customerName: 'Quote Q', mobileNumber: '9876543210', agreementValue: 5000000, stampDuty: 300000, gst: 250000, registration: 30000, totalCost: 5580000 } })
  put(`quotes/${inquiry.id}.pdf`, 'quotation')

  const sale = await prisma.sale.create({
    data: {
      saleNumber: 'NC-001', projectId: project.id, unitId: u1.id, agreementValue: 6543210.55, gstAmount: 327160.53, stampDuty: 392592.63, bookingDate: new Date('2026-09-01T00:00:00.000Z'),
      otherCharges: [{ name: 'Legal', amount: 15000.25 }], nameChangeHistory: [{ oldName: 'A', newName: 'B' }], carParking: true, carParkingCount: 1,
    },
  })
  const buyer = await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Meera Kapoor', panNumber: 'ABCDE1234F', aadhaarNumber: '123412341234', isPrimary: true, whatsappNumber: '+919876543210' } })
  await prisma.kycDocument.create({ data: { buyerId: buyer.id, docType: 'PAN', fileUrl: put('uploads/kyc-pan.jpg', 'pan card image'), status: 'VERIFIED' } })
  const schedule = await prisma.paymentSchedule.create({ data: { saleId: sale.id, milestoneId: milestone.id, description: 'On Plinth', principalAmount: 1000000.1, gstAmount: 50000.01, dueDate: new Date('2026-10-01T00:00:00.000Z'), status: 'OVERDUE', managementApprovedBy: waiverUser.id } })
  await prisma.interestAccrual.create({ data: { scheduleId: schedule.id, date: new Date('2026-10-09T00:00:00.000Z'), principalBase: 1000000.1, ratePercent: 14.5, amount: 397.26 } })
  await prisma.interestWaiver.create({ data: { scheduleId: schedule.id, amount: 100, reason: 'Goodwill', createdById: waiverUser.id } })
  const payment = await prisma.payment.create({ data: { scheduleId: schedule.id, saleId: sale.id, amount: 250000, mode: 'NEFT', paymentDate: new Date('2026-10-02T00:00:00.000Z'), receiptNumber: 'RCP-NC-0004', receiptPdfUrl: put('documents/receipt.pdf', 'receipt') } })
  await prisma.tdsRecord.create({ data: { paymentId: payment.id, saleId: sale.id, tdsAmount: 2500, certificateUrl: put('uploads/tds.pdf', 'tds certificate') } })
  const loan = await prisma.loan.create({ data: { saleId: sale.id, bankName: 'HDFC', sanctionedAmount: 4000000, sanctionLetterUrl: put('uploads/sanction.pdf', 'sanction letter') } })
  await prisma.loanDisbursement.create({ data: { loanId: loan.id, amount: 1000000, date: new Date('2026-10-05T00:00:00.000Z') } })
  await prisma.document.create({ data: { saleId: sale.id, templateId: template.id, type: 'SALE_AGREEMENT', status: 'GENERATED', pdfUrl: put('documents/agreement.docx', 'the agreement'), partnerIds: [asha.id, ravi.id] } })
  await prisma.parkingSlot.create({ data: { projectId: project.id, uniqueKey: 'p1', values: { level: 'P1' }, type: 'Surface', saleId: sale.id } })

  // a cancelled sale stays on the project's record
  const cancelled = await prisma.sale.create({ data: { saleNumber: 'NC-002', projectId: project.id, unitId: u2.id, agreementValue: 1, gstAmount: 0, bookingDate: new Date('2026-09-02T00:00:00.000Z'), status: 'CANCELLED', deletedAt: new Date('2026-09-03T00:00:00.000Z') } })
  // messages are not carried: a queued one would be sent again
  await prisma.communicationLog.create({ data: { saleId: cancelled.id, channel: 'EMAIL', type: 'DEMAND', status: 'QUEUED' } })
  return { project, company, waiverUser, asha, ravi }
}

/** The rows of a snapshot with the ids that are expected to differ between servers set aside */
const comparable = (tables: Record<string, Record<string, unknown>[]>) => {
  const out: Record<string, unknown[]> = {}
  for (const [name, rows] of Object.entries(tables)) {
    out[name] = rows
      .map((r) => {
        const row = JSON.parse(JSON.stringify(r)) as Record<string, unknown> // as a file would carry it: no hidden properties of Prisma's rows
        if (name === 'project') delete row.companyId
        if (name === 'document') delete row.partnerIds
        if (name === 'interestWaiver') delete row.createdById
        if (name === 'paymentSchedule') delete row.managementApprovedBy
        if (name === 'buyer') { delete row.panNumber; delete row.aadhaarNumber } // checked separately (they are in the clear in a snapshot, encrypted again here)
        return row
      })
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  }
  return out
}

describeDb('moving a project to another server', () => {
  beforeEach(async () => { await resetDb(); files.clear() })

  async function exportToBytes(projectId: string) {
    const { exportProject } = await lib()
    const { stream } = await exportProject(projectId, PASS)
    return Buffer.from(await new Response(stream).arrayBuffer())
  }

  async function importBytes(bytes: Buffer, actorId: string, passphrase = PASS) {
    const { readPackage, readBundle, importProject } = await lib()
    const records = readPackage(pieces(bytes), passphrase)
    const parsed = await readBundle(records)
    return importProject(parsed, records, actorId)
  }

  it('brings over everything, exactly, to an empty server', async () => {
    const prisma = await getPrisma()
    const { loadProject } = await lib()
    const { project } = await seedRich()
    const before = (await loadProject(project.id)).bundle
    const filesBefore = new Map(files)
    const bytes = await exportToBytes(project.id)
    expect(bytes.includes(Buffer.from('ABCDE1234F'))).toBe(false) // the numbers are in the file only under the passphrase

    // The other server: nothing in it but its own Super Admin, and one person with the same e-mail as the waiver's author
    await resetDb(); files.clear()
    const importer = await seedUser('SUPER_ADMIN')
    const sameEmail = await seedUser('ADMIN', { email: 'waiver@example.com' })

    const result = await importBytes(bytes, importer.id)
    expect(result).toMatchObject({ projectId: project.id, name: 'Neev Court' })
    expect(result.files).toEqual({ saved: filesBefore.size, missing: 0 }) // every stored file, the letterhead and the quotation included

    const after = (await loadProject(project.id)).bundle
    expect(comparable(after.tables)).toEqual(comparable(before.tables))
    expect(after.files.sort()).toEqual(before.files.sort())

    // every stored file is there with the same content
    for (const [key, content] of filesBefore) expect(files.get(key)?.equals(content), key).toBe(true)

    // identity numbers: encrypted again on this server, and the same when read
    const buyers = await prisma.$queryRaw<{ panNumber: string; aadhaarNumber: string }[]>`SELECT "panNumber", "aadhaarNumber" FROM buyers`
    expect(isEncryptedPii(buyers[0].panNumber)).toBe(true)
    expect([decryptPii(buyers[0].panNumber), decryptPii(buyers[0].aadhaarNumber)]).toEqual(['ABCDE1234F', '123412341234'])
    const partners = await prisma.$queryRaw<{ name: string; panNumber: string }[]>`SELECT "name", "panNumber" FROM partners ORDER BY "name"`
    expect(partners.map((p) => [p.name, isEncryptedPii(p.panNumber), decryptPii(p.panNumber)])).toEqual([['Asha Shah', true, 'ABCPS1234D'], ['Ravi Mehta', true, 'ABCPM1234E']])

    // the company is copied, the document still names the same two partners, and the person with that e-mail is credited
    expect(await prisma.company.count()).toBe(1)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).companyId).toBe((await prisma.company.findFirstOrThrow()).id)
    const doc = await prisma.document.findFirstOrThrow()
    expect((await prisma.partner.findMany({ where: { id: { in: doc.partnerIds } }, orderBy: { name: 'asc' } })).map((p) => p.name)).toEqual(['Asha Shah', 'Ravi Mehta'])
    expect((await prisma.interestWaiver.findFirstOrThrow()).createdById).toBe(sameEmail.id)

    // not carried: old messages
    expect(await prisma.communicationLog.count()).toBe(0)

    // numbering carries on after the imported numbers
    const counters = Object.fromEntries((await prisma.numberSequence.findMany()).map((c) => [c.key, c.value]))
    expect(counters).toMatchObject({ 'sale:NC': 2, 'receipt:NC': 4 })

    // one summary entry, not a copy of the data per table
    expect(await prisma.auditLog.count({ where: { entityType: 'SALE' } })).toBe(0)
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'imported' } })
    expect(entry).toMatchObject({ userId: importer.id, projectId: project.id, entityId: project.id })
    expect(entry.newValues).toMatchObject({ name: 'Neev Court', created: { sale: 2, buyer: 1, payment: 1 } })
  })

  it('credits the importing Super Admin when nobody here has the e-mail of the person named in a record', async () => {
    const prisma = await getPrisma()
    const { project } = await seedRich()
    const bytes = await exportToBytes(project.id)
    await resetDb(); files.clear()
    const importer = await seedUser('SUPER_ADMIN')
    await importBytes(bytes, importer.id)
    expect((await prisma.interestWaiver.findFirstOrThrow()).createdById).toBe(importer.id)
    expect((await prisma.paymentSchedule.findFirstOrThrow()).managementApprovedBy).toBe(importer.id)
  })

  it('uses the company this server already has, matched by name, and adds only the partners it lacks', async () => {
    const prisma = await getPrisma()
    const { project } = await seedRich()
    const bytes = await exportToBytes(project.id)
    await resetDb(); files.clear()
    const importer = await seedUser('SUPER_ADMIN')
    const here = await prisma.company.create({ data: { name: 'NEEV BUILDERS', address: 'Elsewhere' } })
    const ashaHere = await prisma.partner.create({ data: { companyId: here.id, name: 'asha shah' } })

    await importBytes(bytes, importer.id)

    expect(await prisma.company.count()).toBe(1)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: here.id } })).address).toBe('Elsewhere') // not overwritten
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).companyId).toBe(here.id)
    expect((await prisma.partner.findMany({ where: { companyId: here.id } })).map((p) => p.name).sort()).toEqual(['Ravi Mehta', 'asha shah'])
    const doc = await prisma.document.findFirstOrThrow()
    expect(doc.partnerIds).toContain(ashaHere.id)
    expect(doc.partnerIds).toHaveLength(2)
    expect(files.has('letterheads/lh.png')).toBe(false) // the company here keeps its own letterhead
  })

  it('says what is in the file before anything is saved, and writes nothing', async () => {
    const prisma = await getPrisma()
    const { readPackage, readBundle, previewImport } = await lib()
    const { project } = await seedRich()
    const bytes = await exportToBytes(project.id)
    await resetDb(); files.clear()

    const records = readPackage(pieces(bytes), PASS)
    const preview = await previewImport(await readBundle(records))
    await records.return(undefined)

    expect(preview.project).toMatchObject({ name: 'Neev Court', city: 'Mumbai', type: 'MIXED' })
    expect(preview.company).toEqual({ name: 'Neev Builders', onThisServer: false })
    expect(preview.conflicts).toEqual([])
    expect(Object.fromEntries(preview.counts.map((c) => [c.label, c.value]))).toMatchObject({ Wings: 1, Units: 3, Sales: 2, Buyers: 1, Payments: 1, Documents: 1, 'Parking spaces': 1 })
    expect(preview.notes.join(' ')).toContain('will be added with its partners')
    expect(await prisma.project.count()).toBe(0)
    expect(files.size).toBe(0)
  })

  it('refuses to import the same project twice', async () => {
    const prisma = await getPrisma()
    const { project } = await seedRich()
    const bytes = await exportToBytes(project.id)
    const importer = await seedUser('SUPER_ADMIN')
    const salesBefore = await prisma.sale.count()
    await expect(importBytes(bytes, importer.id)).rejects.toMatchObject({ kind: 'conflict', message: 'This project is already on this server' })
    expect(await prisma.sale.count()).toBe(salesBefore)
  })

  it('refuses a project whose sale numbers another project here already uses, and writes nothing', async () => {
    const prisma = await getPrisma()
    const { project } = await seedRich()
    const bytes = await exportToBytes(project.id)
    await resetDb(); files.clear()
    const importer = await seedUser('SUPER_ADMIN')
    const other = await seedProject({ name: 'Nova Centre', units: 1 })
    await prisma.sale.create({ data: { saleNumber: 'NC-001', projectId: other.project.id, unitId: other.units[0].id, agreementValue: 1, gstAmount: 0, bookingDate: new Date() } })

    await expect(importBytes(bytes, importer.id)).rejects.toMatchObject({ kind: 'conflict', message: expect.stringContaining('NC-001') })
    expect(await prisma.project.count({ where: { id: project.id } })).toBe(0)
    expect(files.size).toBe(0)
  })

  it('is all or nothing: a failure part-way leaves no records, no company and no files behind', async () => {
    const prisma = await getPrisma()
    const { project } = await seedRich()
    const bytes = await exportToBytes(project.id)
    const unitId = (await prisma.unit.findFirstOrThrow({ where: { unitNumber: 'A-102' } })).id
    await resetDb(); files.clear()
    const importer = await seedUser('SUPER_ADMIN')
    const other = await seedProject({ name: 'Other', units: 1 })
    await prisma.unit.create({ data: { id: unitId, floorId: other.floor.id, unitNumber: 'Z-1', configuration: '1BHK', carpetAreaSqft: 1 } }) // a unit id the file also uses
    const companies = await prisma.company.count()

    await expect(importBytes(bytes, importer.id)).rejects.toMatchObject({ kind: 'conflict' })

    expect(await prisma.project.count({ where: { id: project.id } })).toBe(0)
    expect(await prisma.company.count()).toBe(companies)
    expect(await prisma.sale.count()).toBe(0)
    expect(await prisma.numberSequence.count()).toBe(0)
    expect(files.size).toBe(0) // the files written before the records failed were taken out again
  })

  it('writes only files the records point at, and only inside the storage area', async () => {
    const { project } = await seedRich()
    const { loadProject, writePackage, gzipJson, RECORD, readPackage, readBundle, importProject } = await lib()
    const { bundle } = await loadProject(project.id)
    const real = [...files.entries()].find(([key]) => key === 'uploads/kyc-pan.jpg')!
    async function* records() {
      yield { type: RECORD.data, meta: {}, body: await gzipJson(bundle) }
      yield { type: RECORD.file, meta: { key: real[0] }, body: real[1] }
      yield { type: RECORD.file, meta: { key: 'evil/pwned.txt' }, body: Buffer.from('x') } // no record points at it
      yield { type: RECORD.file, meta: { key: '../escape.txt' }, body: Buffer.from('x') }
      yield { type: RECORD.file, meta: { key: 'uploads/../../escape.txt' }, body: Buffer.from('x') }
      yield { type: RECORD.file, meta: {}, body: Buffer.from('x') }
    }
    const chunks: Buffer[] = []
    for await (const piece of writePackage(PASS, records())) chunks.push(piece)

    await resetDb(); files.clear()
    const importer = await seedUser('SUPER_ADMIN')
    const stream = readPackage(pieces(Buffer.concat(chunks)), PASS)
    const result = await importProject(await readBundle(stream), stream, importer.id)

    expect([...files.keys()]).toEqual(['uploads/kyc-pan.jpg'])
    expect(result.files.saved).toBe(1)
    expect(result.files.missing).toBe(bundle.files.length - 1) // the rest of the listed files were not in the file
  })

  it('stops the export, saying why, when an identity number cannot be decrypted', async () => {
    const prisma = await getPrisma()
    const { exportProject } = await lib()
    const { project } = await seedRich()
    await prisma.$executeRaw`UPDATE buyers SET "panNumber" = 'enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'`
    await expect(exportProject(project.id, PASS)).rejects.toMatchObject({ kind: 'invalid', message: expect.stringContaining('PII_ENCRYPTION_KEY') })
  })

  it('says so when the project does not exist', async () => {
    const { exportProject } = await lib()
    await expect(exportProject('nope', PASS)).rejects.toMatchObject({ kind: 'notFound' })
  })

  it('keeps an uploaded file as pieces, in order, and tells when one is missing', async () => {
    const { stageChunk, stagedChunks, clearStaged } = await import('@/lib/project-transfer/staging')
    await stageChunk('u1', 'upload-0001', 0, Buffer.from('aa'))
    await stageChunk('u1', 'upload-0001', 1, Buffer.from('bb'))
    const read = async (count: number) => { const out: string[] = []; for await (const c of stagedChunks('u1', 'upload-0001', count)) out.push(c.toString()); return out }
    expect(await read(2)).toEqual(['aa', 'bb'])
    await expect(read(3)).rejects.toMatchObject({ message: 'The upload did not finish. Choose the file and upload it again' })
    await expect((async () => { for await (const c of stagedChunks('u2', 'upload-0001', 1)) void c })()).rejects.toBeTruthy() // another person's pieces are not reachable
    await clearStaged('u1', 'upload-0001', 2)
    expect(files.size).toBe(0)
  })
})
