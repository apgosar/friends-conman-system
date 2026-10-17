import { describe, it, expect } from 'vitest'
import { plain } from '@/lib/plain'

describe('plain', () => {
  it('drops symbol properties, keeps Dates and nesting', () => {
    const when = new Date('2026-10-17T00:00:00Z')
    const row: any = { id: 'a', when, nested: { list: [{ n: 1 }, { n: 2 }] }, nothing: null }
    row[Symbol.for('nodejs.util.inspect.custom')] = () => 'x'
    row.nested.list[0][Symbol('s')] = 1
    const out = plain(row)
    expect(Object.getOwnPropertySymbols(out)).toEqual([])
    expect(Object.getOwnPropertySymbols(out.nested.list[0])).toEqual([])
    expect(out.when).toBe(when)
    expect(out).toEqual({ id: 'a', when, nested: { list: [{ n: 1 }, { n: 2 }] }, nothing: null })
  })
  it('passes primitives through', () => {
    expect(plain(5)).toBe(5)
    expect(plain('x')).toBe('x')
    expect(plain(null)).toBeNull()
  })
})
