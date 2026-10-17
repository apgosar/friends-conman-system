import { describe, expect, it } from 'vitest'
import { formatPhone, joinPhone, normalizePhone, phoneFieldValue, sanitizeCountryCode, splitPhone, whatsappDigits } from '@/lib/phone'

describe('normalizePhone', () => {
  it('treats nothing, or just the +91 prefix, as blank', () => {
    for (const blank of ['', '   ', '+91', '+91 ', '+', '+971 ', '+1', null, undefined]) expect(normalizePhone(blank)).toEqual({ ok: true, value: null })
  })

  it('keeps an Indian number as its 10 digits, however it was written', () => {
    for (const typed of ['9876543210', '+91 9876543210', '+91 98765 43210', '+91-98765-43210', '919876543210', '09876543210', '0091 9876543210']) {
      expect(normalizePhone(typed)).toEqual({ ok: true, value: '9876543210' })
    }
  })

  it('accepts a number from another country as + and its digits', () => {
    expect(normalizePhone('+1 (415) 555-0123')).toEqual({ ok: true, value: '+14155550123' })
    expect(normalizePhone('+44 7911 123456')).toEqual({ ok: true, value: '+447911123456' })
    expect(normalizePhone('0044 7911 123456')).toEqual({ ok: true, value: '+447911123456' })
  })

  it('rejects numbers that cannot be right', () => {
    for (const bad of ['12345', '98765', '5876543210', '+91 12345', '+91 98765 4321', '+91 98765 432100', 'abc', '98765abc10', '+9999999999999999']) {
      expect(normalizePhone(bad).ok, bad).toBe(false)
    }
  })
})

describe('phone boxes', () => {
  it('splits what the form holds into the code box and the number box', () => {
    expect(splitPhone('')).toEqual({ code: '+91', number: '' })
    expect(splitPhone('9876543210')).toEqual({ code: '+91', number: '9876543210' })
    expect(splitPhone('+91 98765 43210')).toEqual({ code: '+91', number: '98765 43210' })
    expect(splitPhone('+971 ')).toEqual({ code: '+971', number: '' })
    expect(splitPhone('+14155550123')).toEqual({ code: '+1', number: '4155550123' })
    expect(splitPhone('+447911123456')).toEqual({ code: '+44', number: '7911123456' })
  })

  it('joins them back, keeping a code typed on its own', () => {
    expect(joinPhone('+971', '')).toBe('+971 ')
    expect(splitPhone(joinPhone('+971', ''))).toEqual({ code: '+971', number: '' })
    expect(normalizePhone(joinPhone('+971', '501234567'))).toEqual({ ok: true, value: '+971501234567' })
    expect(normalizePhone(joinPhone('+91', '98765 43210'))).toEqual({ ok: true, value: '9876543210' })
  })

  it('only lets a plus and up to 4 digits into the code box', () => {
    expect(sanitizeCountryCode('44')).toBe('+44')
    expect(sanitizeCountryCode('+9a1')).toBe('+91')
    expect(sanitizeCountryCode('')).toBe('')
    expect(sanitizeCountryCode('+')).toBe('+')
  })
})

describe('phone display helpers', () => {
  it('shows the +91 prefix for an empty field and for a bare Indian number', () => {
    expect(phoneFieldValue('')).toBe('+91 ')
    expect(phoneFieldValue('9876543210')).toBe('+91 9876543210')
    expect(phoneFieldValue('+44 7911')).toBe('+44 7911')
  })

  it('formats a stored number', () => {
    expect(formatPhone('9876543210')).toBe('+91 9876543210')
    expect(formatPhone('+14155550123')).toBe('+14155550123')
    expect(formatPhone(null)).toBe('')
  })

  it('gives WhatsApp the country code and no plus', () => {
    expect(whatsappDigits('9876543210')).toBe('919876543210')
    expect(whatsappDigits('+14155550123')).toBe('14155550123')
  })
})
