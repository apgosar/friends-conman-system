import { describe, it, expect } from 'vitest'
import { PDFDocument } from '@cantoo/pdf-lib'
import { openForReading } from '@/lib/pdf-password'

async function pdf(options?: { userPassword: string; ownerPassword: string }): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200]).drawText('Aadhaar')
  if (options) doc.encrypt({ ...options, permissions: {} })
  return Buffer.from(await doc.save())
}
const pagesOf = async (b: Buffer) => (await PDFDocument.load(b)).getPageCount() // loads only if there is no lock

describe('openForReading', () => {
  it('passes an image through untouched', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(await openForReading(png)).toEqual({ status: 'ready', buffer: png, unlocked: false })
  })
  it('passes a PDF that is not protected through untouched', async () => {
    const plain = await pdf()
    const opened = await openForReading(plain)
    expect(opened).toMatchObject({ status: 'ready', unlocked: false })
    expect(opened.status === 'ready' && opened.buffer.equals(plain)).toBe(true)
  })
  it('asks for the password of a protected PDF', async () => {
    expect(await openForReading(await pdf({ userPassword: 'RAJE1990', ownerPassword: 'owner' }))).toEqual({ status: 'password-required' })
  })
  it('says when the password is wrong, and does not unlock the file', async () => {
    expect(await openForReading(await pdf({ userPassword: 'RAJE1990', ownerPassword: 'owner' }), 'raje1990')).toEqual({ status: 'wrong-password' })
  })
  it('unlocks the PDF with the right password: the result opens with no password and keeps its pages', async () => {
    const opened = await openForReading(await pdf({ userPassword: 'RAJE1990', ownerPassword: 'owner' }), 'RAJE1990')
    expect(opened).toMatchObject({ status: 'ready', unlocked: true })
    if (opened.status !== 'ready') throw new Error('not ready')
    expect(await pagesOf(opened.buffer)).toBe(1)
    expect(opened.buffer.includes('/Encrypt')).toBe(false)
  })
  it('opens a PDF that is only restricted (no password to open it) without asking', async () => {
    const opened = await openForReading(await pdf({ userPassword: '', ownerPassword: 'owner' }))
    expect(opened).toMatchObject({ status: 'ready', unlocked: true })
  })
  it('leaves a damaged PDF for the reader to judge: it is not locked, so there is nothing to ask', async () => {
    const damaged = Buffer.from('%PDF-1.7 this is not really a pdf')
    expect(await openForReading(damaged)).toMatchObject({ status: 'ready', unlocked: false })
  })
})
