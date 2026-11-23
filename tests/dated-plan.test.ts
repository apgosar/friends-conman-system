import { describe, expect, it } from 'vitest'
import { SaleCreateSchema } from '@/lib/sales/create-sale'
import { SaleEditSchema } from '@/lib/sales/edit-sale'
import { generateDocx } from '@/lib/docx'
import PizZip from 'pizzip'

const buyer = { fullName: 'A Buyer', email: 'a@x.com', whatsappNumber: '9876543210', panNumber: 'ABCDE1234F', address: '1 Main Road' }
const base = { projectId: 'p', unitId: 'u', agreementValue: 1000, bookingDate: '2026-10-01', buyers: [buyer] }
const row = (over: Record<string, unknown> = {}) => ({ description: '12 Month From Demolition', principalAmount: 500, gstAmount: 25, autoRaise: true, raiseOn: '2027-09-01', ...over })

describe('date-based payment plan input', () => {
  it('accepts instalments that each have a name and a date', () => {
    expect(SaleCreateSchema.safeParse({ ...base, paymentSchedules: [row(), row({ description: 'On Possession', raiseOn: '2028-01-01' })] }).success).toBe(true)
  })
  it('needs a valid date on every dated instalment', () => {
    for (const raiseOn of [undefined, null, '', 'not a date']) expect(SaleCreateSchema.safeParse({ ...base, paymentSchedules: [row({ raiseOn })] }).success, String(raiseOn)).toBe(false)
  })
  it('needs a different name for each instalment', () => {
    expect(SaleCreateSchema.safeParse({ ...base, paymentSchedules: [row(), row({ raiseOn: '2028-01-01' })] }).success).toBe(false)
    expect(SaleCreateSchema.safeParse({ ...base, paymentSchedules: [row(), row({ description: '12 month from demolition ' })] }).success).toBe(false)
  })
  it('does not ask a milestone row for a date', () => {
    expect(SaleCreateSchema.safeParse({ ...base, paymentSchedules: [{ description: 'Plinth', principalAmount: 500 }] }).success).toBe(true)
  })
  it('applies the same rules when a sale is edited', () => {
    const edit = { unitId: 'u', agreementValue: 1000, bookingDate: '2026-10-01', buyers: [buyer], reason: 'Dates changed' }
    expect(SaleEditSchema.safeParse({ ...edit, paymentSchedules: [row()] }).success).toBe(true)
    expect(SaleEditSchema.safeParse({ ...edit, paymentSchedules: [row({ raiseOn: '' })] }).success).toBe(false)
  })
})

describe('a template with a date-based branch', () => {
  // A minimal .docx holding one paragraph of text
  const docx = (text: string) => {
    const zip = new PizZip()
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:body></w:document>`)
    return zip.generate({ type: 'nodebuffer' })
  }
  const text = '{{#payment.dateBased}}due on {{payment.scheduledDate}}{{/payment.dateBased}}{{^payment.dateBased}}completed {{milestone.name}}{{/payment.dateBased}}'
  const out = (data: Record<string, unknown>) => new PizZip(generateDocx(docx(text), data)).file('word/document.xml')!.asText().replace(/<[^>]+>/g, '')

  it('shows the date wording for a dated demand and the milestone wording otherwise', () => {
    expect(out({ payment: { dateBased: true, scheduledDate: '1st September 2027' }, milestone: { name: 'X' } })).toBe('due on 1st September 2027')
    expect(out({ payment: { dateBased: false, scheduledDate: '' }, milestone: { name: 'Plinth' } })).toBe('completed Plinth')
  })
})
