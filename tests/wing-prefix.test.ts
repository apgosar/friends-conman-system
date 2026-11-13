import { describe, it, expect } from 'vitest'
import { defaultNumbering, generateUnits, stripWingPrefix } from '@/lib/building-structure'

describe('flat numbering for a single wing', () => {
  it('starts without the wing prefix when there is one wing, and with it for two or more', () => {
    expect(defaultNumbering(0)).toBe('FNN')
    expect(defaultNumbering(1)).toBe('FNN')
    expect(defaultNumbering(2)).toBe('W-FNN')
    const { units } = generateUnits([{ name: 'A', patterns: [{ from: 0, to: 1, unitTypeIds: ['t', 't'] }] }], defaultNumbering(1), { shops: [], offices: [] }, { t: '2 BHK' })
    expect(units.map((u) => u.unitNumber)).toEqual(['G01', 'G02', '101', '102'])
  })
})

describe('stripWingPrefix', () => {
  it('takes the wing off A-101, A101 and the ground floor A-G01', () => {
    expect(stripWingPrefix('A-101', 'A')).toBe('101')
    expect(stripWingPrefix('a101', 'A')).toBe('101')
    expect(stripWingPrefix('A-G01', 'A')).toBe('G01')
    expect(stripWingPrefix('Tower 1-1203', 'Tower 1')).toBe('1203')
  })
  it('leaves a number that has no prefix, or only starts with the same letter', () => {
    expect(stripWingPrefix('101', 'A')).toBeNull()
    expect(stripWingPrefix('Amenity', 'A')).toBeNull()
    expect(stripWingPrefix('A-', 'A')).toBeNull()
    expect(stripWingPrefix('B-101', 'A')).toBeNull()
  })
})
