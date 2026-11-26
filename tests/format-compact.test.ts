import { describe, expect, it } from 'vitest'
import { formatRupeesCompact } from '@/lib/format'

describe('short amounts on headline cards', () => {
  it('are in crore, lakh or thousand, with the unit kept on the same line', () => {
    expect(formatRupeesCompact(1503279061.02)).toBe('₹150.33\u00a0Cr')
    expect(formatRupeesCompact(8641975.23)).toBe('₹86.42\u00a0L')
    expect(formatRupeesCompact(4200)).toBe('₹4.2\u00a0K')
    expect(formatRupeesCompact(0)).toBe('₹0')
    expect(formatRupeesCompact(950.6)).toBe('₹951')
  })
})
