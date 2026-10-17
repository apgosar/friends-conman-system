import { describe, it, expect, beforeEach } from 'vitest'
import crypto from 'node:crypto'
import { decryptPii, encryptPii, isEncryptedPii, maskedAadhaar, maskedPan, resetPiiKey, revealPii } from '@/lib/pii'
import { maskAadhaar, maskPan } from '@/lib/pii-mask'

beforeEach(() => {
  process.env.PII_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64')
  resetPiiKey()
})

describe('PII encryption', () => {
  it('round-trips and never stores the number readable', () => {
    const enc = encryptPii('ABCDE1234F')
    expect(isEncryptedPii(enc)).toBe(true)
    expect(enc).not.toContain('ABCDE')
    expect(decryptPii(enc)).toBe('ABCDE1234F')
  })

  it('gives a different ciphertext each time, and does not encrypt twice', () => {
    const a = encryptPii('123412341234')
    expect(encryptPii('123412341234')).not.toBe(a)
    expect(encryptPii(a)).toBe(a)
  })

  it('passes plain text through until it has been converted', () => {
    expect(decryptPii('ABCDE1234F')).toBe('ABCDE1234F')
    expect(maskedPan('ABCDE1234F')).toBe('XXXXXX234F')
  })

  it('refuses a ciphertext that was tampered with or made with another key', () => {
    const enc = encryptPii('ABCDE1234F')
    const flipped = enc.slice(0, -2) + (enc.endsWith('AA') ? 'BB' : 'AA')
    expect(() => decryptPii(flipped)).toThrow()
    process.env.PII_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64')
    resetPiiKey()
    expect(() => decryptPii(enc)).toThrow()
    expect(maskedPan(enc)).toBe('••••') // screens show nothing real rather than crash
    expect(revealPii(enc)).toBe('')
  })

  it('rejects a key of the wrong size', () => {
    process.env.PII_ENCRYPTION_KEY = Buffer.from('too short').toString('base64')
    resetPiiKey()
    expect(() => encryptPii('x')).toThrow(/32 bytes/)
  })

  it('is required in production', () => {
    const env = process.env as Record<string, string | undefined>
    const before = env.NODE_ENV
    delete env.PII_ENCRYPTION_KEY
    env.NODE_ENV = 'production'
    resetPiiKey()
    try { expect(() => encryptPii('x')).toThrow(/PII_ENCRYPTION_KEY is required/) } finally { env.NODE_ENV = before }
  })
})

describe('masking', () => {
  it('keeps the last four characters only', () => {
    expect(maskPan('ABCDE1234F')).toBe('XXXXXX234F')
    expect(maskAadhaar('1234 5678 9012')).toBe('XXXX XXXX 9012')
    expect(maskAadhaar('123456789012')).toBe('XXXX XXXX 9012')
    expect(maskPan('AB')).toBe('••••')
    expect(maskedAadhaar(encryptPii('123456789012'))).toBe('XXXX XXXX 9012')
    expect(maskedAadhaar(null)).toBeNull()
  })
})
