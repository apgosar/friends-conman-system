/**
 * Mobile / WhatsApp numbers. Indian numbers are stored as the plain 10 digits (as they always were); a number from
 * another country is stored as "+" and its digits, e.g. "+14155550123". Client-safe: the forms and the API share it.
 *
 * Forms show "+91 " in an empty mobile field (see PhoneField) so an Indian number is just typed in; typing another
 * country code in its place is accepted. A field holding nothing but the prefix counts as blank.
 */
export const DEFAULT_COUNTRY_PREFIX = '+91 '

export const PHONE_ERROR = 'Please enter a valid mobile number'

const INDIAN_MOBILE = /^[6-9]\d{9}$/

export type PhoneResult = { ok: true; value: string | null } | { ok: false }

/** Checks and normalises what was typed. Blank (or just "+91") is ok with value null. */
export function normalizePhone(input: string | null | undefined): PhoneResult {
  const s = (input ?? '').replace(/[\s().-]/g, '')
  // Nothing, or only a country code ("+91", "+971"): the number was left blank
  if (s === '' || /^\+\d{0,4}$/.test(s)) return { ok: true, value: null }

  const intl = s.startsWith('+') ? s.slice(1) : s.startsWith('00') ? s.slice(2) : null
  if (intl === null) {
    // No country code: a 10-digit Indian number, optionally written as 91XXXXXXXXXX or 0XXXXXXXXXX
    if (!/^\d+$/.test(s)) return { ok: false }
    if (INDIAN_MOBILE.test(s)) return { ok: true, value: s }
    if (/^91[6-9]\d{9}$/.test(s)) return { ok: true, value: s.slice(2) }
    if (/^0[6-9]\d{9}$/.test(s)) return { ok: true, value: s.slice(1) }
    return { ok: false }
  }

  if (!/^\d{8,15}$/.test(intl)) return { ok: false }
  if (intl.startsWith('91')) return INDIAN_MOBILE.test(intl.slice(2)) && intl.length === 12 ? { ok: true, value: intl.slice(2) } : { ok: false }
  return { ok: true, value: `+${intl}` }
}

export const isValidPhone = (input: string | null | undefined): boolean => normalizePhone(input).ok

/** How a stored number is shown: "+91 9876543210", or the international number as stored. */
export function formatPhone(stored: string | null | undefined): string {
  if (!stored) return ''
  return /^\d{10}$/.test(stored) ? `+91 ${stored}` : stored
}

/** Digits with the country code and no "+", the form WhatsApp wants: "919876543210". */
export function whatsappDigits(stored: string): string {
  const digits = stored.replace(/\D/g, '')
  return digits.length === 10 ? `91${digits}` : digits
}

/** What a mobile field shows for the value held by the form: the "+91 " prefix when empty, or for a bare Indian number. */
export function phoneFieldValue(value: string | null | undefined): string {
  if (!value) return DEFAULT_COUNTRY_PREFIX
  return /^\d{10}$/.test(value) ? `${DEFAULT_COUNTRY_PREFIX}${value}` : value
}

/**
 * A mobile field is two boxes: the country code ("+91") and the number. The form holds one string, "+91 9876543210".
 * A bare 10-digit number (as stored for India) or an empty value shows with +91; a stored international number is split
 * after its country code (1 digit for +1 and +7, otherwise 2 digits).
 */
export function splitPhone(value: string | null | undefined): { code: string; number: string } {
  const raw = value ?? ''
  if (!raw.trim() || /^[\d\s().-]+$/.test(raw)) return { code: '+91', number: raw.trim() }
  const spaced = raw.match(/^(\+\d{0,4}) (.*)$/)
  if (spaced) return { code: spaced[1], number: spaced[2] }
  if (!raw.startsWith('+')) return { code: '+91', number: raw.trim() }
  // an international number stored without a space
  const digits = raw.replace(/\D/g, '')
  const len = digits.startsWith('1') || digits.startsWith('7') ? 1 : 2
  return { code: '+' + digits.slice(0, len), number: digits.slice(len) }
}

export const joinPhone = (code: string, number: string): string => `${code.trim()} ${number}`

/** The country code box accepts only a "+" and up to 4 digits. */
export function sanitizeCountryCode(typed: string): string {
  const digits = typed.replace(/\D/g, '').slice(0, 4)
  return digits ? `+${digits}` : typed.includes('+') ? '+' : ''
}

/** Drops anything that can't be part of a phone number as it is typed. */
export const sanitizePhoneInput = (typed: string): string => typed.replace(/[^\d+\s()-]/g, '')
