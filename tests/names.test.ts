import { describe, it, expect } from 'vitest'
import { namesMatch } from '@/lib/names'

describe('namesMatch', () => {
  it('ignores capital letters, dots and extra spaces', () => {
    expect(namesMatch('Dhruval  Mehta', 'DHRUVAL MEHTA')).toBe(true)
    expect(namesMatch('K. R. Mehta', 'K R MEHTA')).toBe(true)
  })
  it('ignores the order of the words', () => {
    expect(namesMatch('Mehta Kirit Shah', 'Kirit Shah Mehta')).toBe(true)
  })
  it('flags a different, missing or extra word', () => {
    expect(namesMatch('Kirit Mehta', 'Kirit Shah')).toBe(false)
    expect(namesMatch('Kirit Mehta', 'Kirit K Mehta')).toBe(false)
    expect(namesMatch('Kirit Mehta', 'Kiritbhai Mehta')).toBe(false)
  })
})
