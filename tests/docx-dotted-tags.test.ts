import { describe, it, expect } from 'vitest'
import PizZip from 'pizzip'
import { generateDocx } from '@/lib/docx'

const template = (body: string) => {
  const zip = new PizZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`)
  return zip.generate({ type: 'nodebuffer' })
}
const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
const textOf = (buf: Buffer) => (new PizZip(buf).file('word/document.xml')!.asText().match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? []).map((s) => s.replace(/<[^>]+>/g, ''))

describe('generateDocx tags', () => {
  it('reads fields of an object with a dot', () => {
    const out = generateDocx(template(p('{{payment.totalDue}} for {{milestone.name}}')), { payment: { totalDue: '5' }, milestone: { name: 'Plinth' } })
    expect(textOf(out)).toEqual(['5 for Plinth'])
  })
  it('repeats a paragraph loop once per item and drops the tag paragraphs', () => {
    const out = generateDocx(template(p('{{#buyers}}') + p('{{index}}. {{fullName}}') + p('{{/buyers}}')), { buyers: [{ index: 1, fullName: 'A' }, { index: 2, fullName: 'B' }] })
    expect(textOf(out)).toEqual(['1. A', '2. B'])
  })
  it('shows a section only when its flag is true', () => {
    const t = template(p('x{{#hasParking}} parking{{/hasParking}}'))
    expect(textOf(generateDocx(t, { hasParking: true }))).toEqual(['x parking'])
    expect(textOf(generateDocx(t, { hasParking: false }))).toEqual(['x'])
  })
})
