import { describe, expect, it } from 'vitest'
import { CompanySchema, PartnerSchema, checkAgreementPartners, namesPartners } from '@/lib/companies'
import { buildSalePayload } from '@/lib/documents/payload'
import { findTagIssues } from '@/lib/template-tags'
import { formatPhoneList } from '@/lib/phone'

describe('CompanySchema', () => {
  const ok = { name: 'Paradigm Friends Realtors LLP', panNumber: 'aadcb2230m', gstin: '27aadcb2230m1z2', address: '45 Builder Tower, Mumbai' }

  it('accepts a company and tidies the PAN and GSTIN', () => {
    expect(CompanySchema.parse(ok)).toEqual({ ...ok, panNumber: 'AADCB2230M', gstin: '27AADCB2230M1Z2' })
  })

  it('allows a company without a GSTIN', () => {
    expect(CompanySchema.parse({ ...ok, gstin: '' }).gstin).toBeNull()
  })

  it('asks for the name, a valid PAN, a valid GSTIN and the address', () => {
    const message = (over: Record<string, unknown>) => {
      const r = CompanySchema.safeParse({ ...ok, ...over })
      return r.success ? null : r.error.issues[0].message
    }
    expect(message({ name: ' ' })).toMatch(/company name/)
    expect(message({ panNumber: '' })).toBe('Please enter valid PAN number')
    expect(message({ panNumber: '12345' })).toBe('Please enter valid PAN number')
    expect(message({ gstin: '27AADCB2230M1' })).toBe('Please enter valid GSTIN')
    expect(message({ address: '' })).toMatch(/address/)
  })
})

describe('PartnerSchema', () => {
  it('needs a name; the PAN and address are optional', () => {
    expect(PartnerSchema.parse({ name: ' Rajesh Shah ', address: '' })).toEqual({ name: 'Rajesh Shah', address: null, panNumber: undefined })
    expect(PartnerSchema.parse({ name: 'A', address: 'Pune', panNumber: 'abcde1234f' }).panNumber).toBe('ABCDE1234F')
    expect(PartnerSchema.parse({ name: 'A', address: '', panNumber: '' }).panNumber).toBeNull() // empty = no PAN
    expect(PartnerSchema.safeParse({ name: '', address: '' }).success).toBe(false)
    expect(PartnerSchema.safeParse({ name: 'A', address: '', panNumber: 'nope' }).success).toBe(false)
  })
  it('accepts its own output again: the screen parses, then the server parses what was sent', () => {
    const once = PartnerSchema.parse({ name: 'A', address: '', panNumber: '' })
    expect(PartnerSchema.parse(once)).toEqual(once)
    const withPan = PartnerSchema.parse({ name: 'A', address: 'Pune', panNumber: 'abcde1234f' })
    expect(PartnerSchema.parse(withPan)).toEqual(withPan)
  })
})

describe('checkAgreementPartners', () => {
  const four = ['a', 'b', 'c', 'd']

  it('accepts any number of the active partners, but at least one when the company has partners', () => {
    expect(checkAgreementPartners(four, ['a', 'c'])).toBeNull()
    expect(checkAgreementPartners(four, ['a'])).toBeNull()
    expect(checkAgreementPartners(four, ['a', 'b', 'c'])).toBeNull()
    expect(checkAgreementPartners(four, four)).toBeNull()
    expect(checkAgreementPartners(four, [])).toMatch(/at least one/)
  })

  it('rejects a partner twice, or one who is not an active partner of the company', () => {
    expect(checkAgreementPartners(four, ['a', 'a'])).toMatch(/different/)
    expect(checkAgreementPartners(four, ['a', 'zzz'])).toMatch(/still active/)
  })

  it('lets a company with no partners generate an agreement without them', () => {
    expect(checkAgreementPartners([], [])).toBeNull()
  })

  it('applies to the sale agreement and the PAAA only', () => {
    expect(namesPartners('SALE_AGREEMENT')).toBe(true)
    expect(namesPartners('PAAA')).toBe(true)
    expect(namesPartners('DEMAND_LETTER')).toBe(false)
  })
})

describe('partners in a document', () => {
  const sale: any = {
    id: 's', saleNumber: 'S-1', agreementValue: 1000000, gstAmount: 0, stampDuty: 0, registrationCharges: 0, carParkingCharges: 0, bookingAmount: 0,
    bookingDate: new Date('2026-01-05'), parkingPodiumLevel: null, parkingFloor: null, parkingNumber: null, tenant: null,
    project: { company: { name: 'Neev LLP', address: 'Pune', gstin: '27AADCB2230M1Z2', panNumber: 'AADCB2230M' }, name: 'P', reraNumber: null, tdsRatePercent: 1 },
    unit: { floor: { floorNumber: 1, wing: { name: 'A' } }, unitNumber: 'A-101', configuration: '2BHK', carpetAreaSqft: 700 },
    buyers: [{ fullName: 'Asha', address: null, panNumber: null, aadhaarNumber: null, email: null, whatsappNumber: null, isPrimary: true }],
    paymentSchedules: [],
  }

  it('names all the chosen partners in one line, however many there are', () => {
    const three = [{ name: 'Rajesh Shah', address: null, panNumber: null }, { name: 'Meena Patel', address: null, panNumber: null }, { name: 'Kiran Rao', address: null, panNumber: null }]
    expect(buildSalePayload(sale, three).partnerNames).toBe('Rajesh Shah, Meena Patel and Kiran Rao')
    expect(buildSalePayload(sale, three.slice(0, 1)).partnerNames).toBe('Rajesh Shah')
    expect(buildSalePayload(sale, three).partners).toHaveLength(3)
    expect(buildSalePayload(sale).partnerNames).toBe('')
  })

  it('carries the company PAN and the two chosen partners', () => {
    const p = buildSalePayload(sale, [{ name: 'Rajesh Shah', address: 'Mumbai', panNumber: null }, { name: 'Meena Patel', address: null, panNumber: null }])
    expect(p).toMatchObject({ companyName: 'Neev LLP', companyPan: 'AADCB2230M', partner1Name: 'Rajesh Shah', partner1Address: 'Mumbai', partner2Name: 'Meena Patel', partner2Address: '' })
    expect(p.partners).toMatchObject([{ index: 1, ordinal: '1st', name: 'Rajesh Shah' }, { index: 2, ordinal: '2nd', name: 'Meena Patel' }])
  })

  it('leaves the partner tags empty when none are chosen', () => {
    expect(buildSalePayload(sale)).toMatchObject({ partner1Name: '', partner2Name: '', partners: [] })
  })

  it('lets a sale agreement template use the partner tags and the partners section, but not a receipt', () => {
    const template = '{{partner1Name}} {{partner2Name}} {{companyPan}} {{#partners}}{{name}}{{/partners}}'
    const issues = (type: string) => findTagIssues(template, type, 'DOCX')
    expect(issues('SALE_AGREEMENT')).toEqual({ unknown: [], wrongType: [], htmlSections: [] })
    expect(issues('DEMAND_LETTER').wrongType).toEqual(expect.arrayContaining(['partner1Name', 'partner2Name', 'partners']))
    expect(issues('RECEIPT').wrongType).toContain('partner1Name')
  })
})

describe('contact numbers', () => {
  const company = { name: 'Neev', panNumber: 'AAAPL1234C', gstin: '', address: 'Pune' }
  it('are optional, checked one by one and tidied', () => {
    expect(CompanySchema.parse(company).contactNumbers).toBeUndefined()
    expect(CompanySchema.parse({ ...company, contactNumbers: '' }).contactNumbers).toBeNull()
    expect(CompanySchema.parse({ ...company, contactNumbers: '98765 43210; +91 91234 56789\n9876543210' }).contactNumbers).toBe('9876543210, 9123456789')
    expect(CompanySchema.safeParse({ ...company, contactNumbers: '98765, 12' }).success).toBe(false)
  })
  it('read back as people write them', () => {
    expect(formatPhoneList('9876543210, +14155550123')).toBe('+91 9876543210, +14155550123')
    expect(formatPhoneList(null)).toBe('')
  })
})
