import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { RECORD, gunzipJson, gzipJson, readPackage, writePackage, type PackageRecord } from '@/lib/project-transfer/package'
import { LEFT_BEHIND, TABLES, columnsOf, isSafeKey, parseRows, quoteKeyOf, storageKeyOf } from '@/lib/project-transfer/tables'

async function* from<T>(items: T[]): AsyncGenerator<T> { for (const i of items) yield i }

/** The file as bytes, from records */
async function pack(passphrase: string, records: PackageRecord[]): Promise<Buffer> {
  const parts: Buffer[] = []
  for await (const piece of writePackage(passphrase, from(records))) parts.push(piece)
  return Buffer.concat(parts)
}

/** The bytes handed over in pieces of an awkward size, as an upload in chunks would */
async function* pieces(bytes: Buffer, size: number): AsyncGenerator<Buffer> {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size)
}

async function unpack(bytes: Buffer, passphrase: string, size = 7000): Promise<PackageRecord[]> {
  const out: PackageRecord[] = []
  for await (const record of readPackage(pieces(bytes, size), passphrase)) out.push(record)
  return out
}

const file = (key: string, body: Buffer): PackageRecord => ({ type: RECORD.file, meta: { key }, body })
const PASS = 'correct horse battery'

describe('the project file', () => {
  it('gives back what was put in, across many frames and awkward piece sizes', async () => {
    const big = Buffer.alloc(2_500_000, 7) // more than two frames on its own
    big.writeUInt32BE(0xdeadbeef, 1_234_567)
    const records = [
      { type: RECORD.data, meta: {}, body: await gzipJson({ hello: 'world', n: [1, 2, 3] }) } as PackageRecord,
      file('uploads/a.pdf', Buffer.from('small')),
      file('uploads/b.pdf', big),
      file('uploads/empty.pdf', Buffer.alloc(0)),
    ]
    const bytes = await pack(PASS, records)
    for (const size of [13, 7000, 1_048_576, bytes.length]) {
      const back = await unpack(bytes, PASS, size)
      expect(back.map((r) => [r.type, r.meta])).toEqual(records.map((r) => [r.type, r.meta]))
      expect(back.map((r) => r.body.equals(records[back.indexOf(r)].body))).toEqual([true, true, true, true])
    }
    expect(await gunzipJson((await unpack(bytes, PASS))[0].body)).toEqual({ hello: 'world', n: [1, 2, 3] })
  })

  it('does not contain the text it protects', async () => {
    const bytes = await pack(PASS, [file('uploads/x.txt', Buffer.from('AAAPL1234C and a long enough sentence to find'))])
    expect(bytes.includes(Buffer.from('AAAPL1234C'))).toBe(false)
    expect(bytes.includes(Buffer.from('uploads/x.txt'))).toBe(false)
  })

  it('is different every time (new salt), and an empty project file still opens', async () => {
    const a = await pack(PASS, [])
    const b = await pack(PASS, [])
    expect(a.equals(b)).toBe(false)
    expect(await unpack(a, PASS)).toEqual([])
  })

  it('refuses a wrong passphrase in plain words', async () => {
    const bytes = await pack(PASS, [file('uploads/a.pdf', Buffer.from('x'))])
    await expect(unpack(bytes, 'not the passphrase')).rejects.toMatchObject({ kind: 'invalid', message: expect.stringContaining('passphrase is wrong') })
  })

  it('refuses something that is not a project file', async () => {
    await expect(unpack(Buffer.from('PK\u0003\u0004 this is a zip, honest'), PASS)).rejects.toMatchObject({ message: 'This is not a Neev CMS project file' })
    await expect(unpack(Buffer.alloc(0), PASS)).rejects.toMatchObject({ message: 'This is not a Neev CMS project file' })
  })

  it('notices a file that was cut short, whatever the cut', async () => {
    const bytes = await pack(PASS, [file('uploads/a.pdf', Buffer.alloc(1_500_000, 1))])
    for (const cut of [bytes.length - 1, bytes.length - 20, bytes.length - 1_000_000, 30]) {
      await expect(unpack(bytes.subarray(0, cut), PASS)).rejects.toMatchObject({ kind: 'invalid', message: expect.stringContaining('damaged') })
    }
  })

  it('notices a changed byte anywhere', async () => {
    const bytes = await pack(PASS, [file('uploads/a.pdf', Buffer.alloc(1_500_000, 1))])
    for (const at of [10, 30, 100, 1_100_000, bytes.length - 3]) {
      const copy = Buffer.from(bytes)
      copy[at] ^= 0xff
      await expect(unpack(copy, PASS)).rejects.toBeTruthy()
    }
  })

  it('notices data added after the end', async () => {
    const bytes = await pack(PASS, [file('uploads/a.pdf', Buffer.from('x'))])
    await expect(unpack(Buffer.concat([bytes, Buffer.from('more')]), PASS)).rejects.toMatchObject({ message: expect.stringContaining('damaged') })
  })

  it('notices frames taken out of order', async () => {
    const frames: Buffer[] = []
    for await (const piece of writePackage(PASS, from([file('uploads/a.pdf', Buffer.alloc(3_200_000, 9))]))) frames.push(piece)
    // header, then 4 frames: swap the middle two
    const swapped = Buffer.concat([frames[0], frames[1], frames[3], frames[2], ...frames.slice(4)])
    await expect(unpack(swapped, PASS)).rejects.toBeTruthy()
  })
})

describe('what moves with a project', () => {
  const models = Prisma.dmmf.datamodel.models

  it('covers every table in the schema, or says why it is left behind', () => {
    const named = new Set([...TABLES.map((t) => t.model), ...Object.keys(LEFT_BEHIND)])
    expect(models.map((m) => m.name).filter((name) => !named.has(name))).toEqual([]) // a new table needs a decision here
    expect([...named].filter((name) => !models.some((m) => m.name === name))).toEqual([]) // and a removed one must go
  })

  it('names each table on the client the way the schema does', () => {
    for (const t of TABLES) expect(t.delegate).toBe(t.model[0].toLowerCase() + t.model.slice(1))
  })

  it('only points at columns that exist', () => {
    for (const t of TABLES) {
      const names = columnsOf(t.model).map((c) => c.name)
      for (const c of [...(t.files ?? []), ...(t.users ?? []), ...(t.pii ?? [])]) expect(names, `${t.model}.${c}`).toContain(c)
    }
  })

  it('lists every column that holds a stored file', () => {
    // A column named like a file address that is not registered would travel without its file
    const registered = new Set(TABLES.flatMap((t) => (t.files ?? []).map((c) => `${t.model}.${c}`)))
    registered.add('Company.letterheadUrl') // carried with the company
    const urlColumns = models.flatMap((m) => m.fields.filter((f) => f.kind === 'scalar' && /(Url)$/.test(f.name)).map((f) => `${m.name}.${f.name}`))
    expect(urlColumns.filter((c) => !registered.has(c))).toEqual([])
  })

  it('writes parents before the tables that point at them', () => {
    const order = TABLES.map((t) => t.model)
    for (const m of TABLES.map((t) => models.find((x) => x.name === t.model)!)) {
      for (const f of m.fields.filter((x) => x.kind === 'object' && (x.relationFromFields?.length ?? 0) > 0)) {
        const parent = order.indexOf(f.type)
        if (parent === -1) continue // company: handled before the tables are written
        expect(parent, `${m.name} -> ${f.type}`).toBeLessThan(order.indexOf(m.name))
      }
    }
  })

  it('reads a row: converts dates, keeps nulls, drops what the schema does not know', () => {
    const [row] = parseRows('Sale', 'sale', [{
      id: 'c1', saleNumber: 'NC-001', projectId: 'p', unitId: 'u', agreementValue: 1234567.89, gstAmount: '61728.39',
      bookingDate: '2026-11-03T05:30:00.000Z', otherCharges: null, extra: 'ignored',
    }])
    expect(row.bookingDate).toEqual(new Date('2026-11-03T05:30:00.000Z'))
    expect(row.otherCharges).toBe(Prisma.DbNull)
    expect(row.gstAmount).toBe('61728.39')
    expect(row).not.toHaveProperty('extra')
    expect(row).not.toHaveProperty('createdAt') // has a default: left to the database
  })

  it('rejects a row with a missing or wrong value, naming the table and row but not the value', () => {
    expect(() => parseRows('Sale', 'sale', [{ id: 'c1' }])).toThrow(/sale, row 1/)
    expect(() => parseRows('Unit', 'unit', [{ id: 'u', floorId: 'f', unitNumber: 'A', configuration: '2BHK', carpetAreaSqft: 'abc' }])).toThrow(/unit, row 1/)
    expect(() => parseRows('Unit', 'unit', 'not rows')).toThrow(/damaged/)
  })

  it('only writes keys that stay inside the storage area', () => {
    expect(isSafeKey('documents/abc_AGREEMENT_NC-001.docx')).toBe(true)
    for (const bad of ['../etc/passwd', '/abs/path', 'a/../b', 'a//b', 'a/./b', '', 'a b/c', 'a\\b']) expect(isSafeKey(bad)).toBe(false)
  })

  it('finds the storage key of a stored file URL, and ignores anything else', () => {
    expect(storageKeyOf('/api/files/documents%2Fabc.pdf')).toBe('documents/abc.pdf')
    expect(storageKeyOf('/uploads/old-name.pdf')).toBe('uploads/old-name.pdf')
    expect(storageKeyOf('https://elsewhere.example/x.pdf')).toBeNull()
    expect(storageKeyOf('/api/files/..%2F..%2Fsecret')).toBeNull()
    expect(storageKeyOf(null)).toBeNull()
    expect(quoteKeyOf('q1')).toBe('quotes/q1.pdf')
  })
})

describe('reading the data of a file', () => {
  const data = (over: Record<string, unknown> = {}) => ({
    format: 1, exportedAt: '2026-11-05T10:00:00.000Z', appVersion: '0.0.43', migration: '20261103000000_parking_type_short',
    company: { row: { id: 'c1', name: 'Neev Builders', address: 'Andheri' }, partners: [] },
    users: {}, files: [],
    tables: { project: [{ id: 'p1', name: 'Neev Court', address: 'Road 1', city: 'Mumbai', companyId: 'c1' }] },
    ...over,
  })

  it('accepts a file from this version or an older one, filling in the tables it does not have', async () => {
    const { parseBundle } = await import('@/lib/project-transfer/bundle')
    const parsed = parseBundle(data(), '20261103000000_parking_type_short')
    expect(parsed.tables.project).toHaveLength(1)
    expect(parsed.tables.sale).toEqual([])
    expect(() => parseBundle(data({ migration: '20261001000000_older' }), '20261103000000_parking_type_short')).not.toThrow()
  })

  it('refuses a file from a newer version, telling the person to update this server first', async () => {
    const { parseBundle } = await import('@/lib/project-transfer/bundle')
    expect(() => parseBundle(data({ format: 2 }), '')).toThrow(/newer version.*Update this server first/)
    expect(() => parseBundle(data({ migration: '20270101000000_later' }), '20261103000000_parking_type_short')).toThrow(/newer version.*Update this server first/)
  })

  it('refuses data that is not what an export writes', async () => {
    const { parseBundle } = await import('@/lib/project-transfer/bundle')
    expect(() => parseBundle('nope', '')).toThrow(/damaged/)
    expect(() => parseBundle(data({ tables: { project: [] } }), '')).toThrow(/exactly one project/)
    expect(() => parseBundle(data({ tables: { project: [{ id: 'a' }, { id: 'b' }] } }), '')).toThrow()
    expect(() => parseBundle(data({ company: { row: { id: 'c1' }, partners: [] } }), '')).toThrow(/company/)
  })
})
