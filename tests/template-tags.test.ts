import { describe, it, expect } from 'vitest'
import { findTagIssues, requiredTemplateTypes } from '@/lib/template-tags'

describe('findTagIssues', () => {
  it('accepts a section on a field of the surrounding loop, such as {{#hasNext}} inside {{#buyers}}', () => {
    const text = '{{#buyers}}{{index}}) {{fullName}}{{#hasNext}}; {{/hasNext}}{{/buyers}} {{buyerNames}} {{#hasParking}}x{{/hasParking}}'
    expect(findTagIssues(text, 'SALE_AGREEMENT', 'DOCX').unknown).toEqual([])
  })
  it('still flags an unknown section and keeps the nesting right after it', () => {
    const issues = findTagIssues('{{#buyers}}{{#nope}}{{/nope}}{{fullName}}{{/buyers}}{{oops}}', 'SALE_AGREEMENT', 'DOCX')
    expect(issues.unknown.sort()).toEqual(['nope', 'oops'])
  })
  it('knows the tags of the demand letter and receipt templates', () => {
    expect(findTagIssues('{{payment.percentOfAV}} {{payment.gstOutstanding}} {{receipt.mode}} {{unitKind}}', 'DEMAND_LETTER', 'DOCX').unknown).toEqual([])
    expect(findTagIssues('{{unitKind}} {{unitNumber}} {{receipt.amount}}', 'RECEIPT', 'DOCX')).toMatchObject({ unknown: [], wrongType: [] })
  })
})

describe('interest tags', () => {
  it('lets a demand letter use the interest tags and the interest section, but not a receipt or an agreement', () => {
    const text = '{{#payment.showInterest}}{{payment.interestOutstanding}} {{payment.interestNote}}{{/payment.showInterest}} {{payment.outstandingInterest}} {{payment.totalPayableWithInterest}}'
    expect(findTagIssues(text, 'DEMAND_LETTER', 'DOCX')).toMatchObject({ unknown: [], wrongType: [] })
    expect(findTagIssues(text, 'RECEIPT', 'DOCX').wrongType).toContain('payment.interestNote')
    expect(findTagIssues('{{receipt.interestPaid}}', 'RECEIPT', 'DOCX')).toMatchObject({ unknown: [], wrongType: [] })
  })
})

describe('requiredTemplateTypes', () => {
  it('needs the demand letter and receipt always, the sale agreement unless the project is all redevelopment, and never the PAAA', () => {
    expect(requiredTemplateTypes('FRESH')).toEqual(['DEMAND_LETTER', 'RECEIPT', 'SALE_AGREEMENT'])
    expect(requiredTemplateTypes('MIXED')).toEqual(['DEMAND_LETTER', 'RECEIPT', 'SALE_AGREEMENT'])
    expect(requiredTemplateTypes('REDEVELOPMENT')).toEqual(['DEMAND_LETTER', 'RECEIPT'])
  })
})
