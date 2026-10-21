import { describe, it, expect } from 'vitest'
import { findTagIssues } from '@/lib/template-tags'

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
