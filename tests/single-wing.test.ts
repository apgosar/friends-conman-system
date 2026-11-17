import { describe, it, expect } from 'vitest'
import { wingTitle, residentialWingNames } from '@/lib/building-structure'
import { findTagIssues } from '@/lib/template-tags'

describe('a single-wing project has no wing to name', () => {
  it('names the building and its shops without a wing, and a multi-wing project with one', () => {
    expect(wingTitle(true, 'A')).toBe('Building')
    expect(wingTitle(true, 'Commercial')).toBe('Shops and offices')
    expect(wingTitle(false, 'A')).toBe('Wing A')
    expect(wingTitle(false, 'Commercial')).toBe('Commercial block')
    expect(wingTitle(undefined, 'B')).toBe('Wing B')
  })
  it('counts the wings of a project without the commercial block, ignoring case and blanks', () => {
    expect(residentialWingNames(['A', 'a ', 'Commercial', ''])).toEqual(['a'])
    expect(residentialWingNames(['A', 'B', 'Commercial'])).toHaveLength(2)
  })
  it('knows the wing tags', () => {
    expect(findTagIssues('{{#hasWings}}Wing {{wingName}}, {{/hasWings}}', 'POSSESSION_LETTER', 'DOCX').unknown).toEqual([])
  })
})
