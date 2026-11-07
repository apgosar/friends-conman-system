import { describe, it, expect } from 'vitest'
import { addressLines } from '@/lib/buyers'
import { formatDateLong } from '@/lib/format'
import { possessionReady } from '@/lib/status'
import { isMultiTemplateType, templateLabel, templateSlot } from '@/lib/template-constants'
import { validateTemplateMeta, TemplateValidationError } from '@/lib/template-validation'
import { findTagIssues } from '@/lib/template-tags'

describe('addressLines', () => {
  it('breaks the address of the sample handover letter into its three lines', () => {
    expect(addressLines('7-C/34, Shree Jawahar CHS LTD, Sodawala Lane, Opp. Balwant Society, Govind Nagar Borivali (W) - 400092.')).toEqual([
      '7-C/34, Shree Jawahar CHS LTD,',
      'Sodawala Lane, Opp. Balwant Society,',
      'Govind Nagar Borivali (W) - 400092.',
    ])
  })
  it('never makes more lines than asked, and leaves an address without commas on one line', () => {
    expect(addressLines('1, 2, 3, 4, 5, 6, 7, 8')).toHaveLength(3)
    expect(addressLines('1, 2, 3, 4', 2)).toHaveLength(2)
    expect(addressLines('No commas here at all')).toEqual(['No commas here at all'])
    expect(addressLines('A, B')).toEqual(['A,', 'B'])
  })
  it('gives nothing for an empty address', () => {
    expect(addressLines('')).toEqual([])
    expect(addressLines(null)).toEqual([])
    expect(addressLines(' , ,')).toEqual([])
  })
})

describe('possession documents', () => {
  it('are made only for a fully paid sale', () => {
    expect(possessionReady('ALL_PAID')).toBe(true)
    expect(possessionReady('HANDOVER_COMPLETED')).toBe(true)
    for (const s of ['BOOKED', 'AGREEMENT_DONE', 'IN_PROGRESS', 'CANCELLED']) expect(possessionReady(s)).toBe(false)
  })
  it('are versioned by their own name; other templates by their type', () => {
    expect(isMultiTemplateType('POSSESSION_LETTER')).toBe(true)
    expect(templateSlot('p', 'POSSESSION_LETTER', 'Gas NOC')).toEqual({ projectId: 'p', type: 'POSSESSION_LETTER', name: 'Gas NOC' })
    expect(templateSlot('p', 'DEMAND_LETTER', 'Demand Letter')).toEqual({ projectId: 'p', type: 'DEMAND_LETTER' })
    expect(templateLabel('POSSESSION_LETTER', 'Gas NOC')).toBe('Possession document: Gas NOC')
    expect(templateLabel('DEMAND_LETTER', 'Demand Letter')).toBe('Demand Letter')
  })
  it('need a name when uploaded', () => {
    expect(validateTemplateMeta('POSSESSION_LETTER', '  Gas   NOC ')).toEqual({ type: 'POSSESSION_LETTER', name: 'Gas NOC' })
    expect(() => validateTemplateMeta('POSSESSION_LETTER', ' ')).toThrow(TemplateValidationError)
    expect(validateTemplateMeta('RECEIPT', 'ignored')).toEqual({ type: 'RECEIPT', name: 'Receipt' })
  })
  it('know the address line and date tags', () => {
    const text = '{{todayDate}} {{agreementDate}} {{possessionDate}} {{buyer1AddressLines}} {{buyer1AddressLine1}} {{buyer1AddressLine3}} {{#buyers}}{{fullName}} {{addressLines}}{{/buyers}}'
    expect(findTagIssues(text, 'POSSESSION_LETTER', 'DOCX')).toMatchObject({ unknown: [], wrongType: [] })
  })
})

describe('formatDateLong', () => {
  it('writes the day with its ordinal and the month in full', () => {
    expect(formatDateLong(new Date(2024, 3, 15))).toBe('15th April 2024')
    expect(formatDateLong(new Date(2024, 4, 1))).toBe('1st May 2024')
    expect(formatDateLong(new Date(2024, 4, 22))).toBe('22nd May 2024')
    expect(formatDateLong(new Date(2024, 4, 13))).toBe('13th May 2024')
  })
})
