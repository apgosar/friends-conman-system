/**
 * Cleaning and checking what the document reader returns for a PAN or Aadhaar card.
 *
 * A language model can misread a digit, so nothing it returns is trusted as it is: a PAN must have the PAN shape, and an
 * Aadhaar must be 12 digits that pass the Verhoeff checksum every real Aadhaar number carries (one wrong digit fails it).
 * A value that does not pass is left out rather than pre-filled wrong, and the screen asks the person to type it.
 * Pure functions, no I/O, so they are tested without any service.
 */

import { fail } from '@/lib/errors'

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/

/** The most a document photo or PDF can be: Gemini takes the file inside the request. */
export const MAX_READ_BYTES = 10 * 1024 * 1024

// Verhoeff checksum tables (the check Aadhaar numbers use)
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

/** True when the digit string passes the Verhoeff check (its last digit is the check digit). */
export function verhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false
  let c = 0
  const reversed = digits.split('').reverse()
  for (let i = 0; i < reversed.length; i++) c = D[c][P[i % 8][Number(reversed[i])]]
  return c === 0
}

/** The PAN in capitals with nothing but its ten characters, or undefined when it is not a PAN. */
export function cleanPan(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const pan = raw.replace(/[\s-]/g, '').toUpperCase()
  return PAN_PATTERN.test(pan) ? pan : undefined
}

/** The Aadhaar as 12 digits with no spaces, or undefined when it is not 12 digits or fails the checksum. */
export function cleanAadhaar(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const digits = raw.replace(/[\s-]/g, '')
  return /^\d{12}$/.test(digits) && verhoeffValid(digits) ? digits : undefined
}

/** A name or address with the whitespace tidied; undefined when empty. Capped so a runaway answer cannot fill a form. */
export function cleanText(raw: unknown, max: number): string | undefined {
  if (typeof raw !== 'string') return undefined
  const text = raw.replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : undefined
}

/** The file type from the first bytes, not from the file name (a renamed file is still read as what it is). */
export function sniffMimeType(bytes: Uint8Array): 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | undefined {
  const head = (n: number) => Buffer.from(bytes.subarray(0, n))
  if (head(1024).includes('%PDF-')) return 'application/pdf'
  if (head(3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg'
  if (head(8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (head(4).toString('latin1') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('latin1') === 'WEBP') return 'image/webp'
  return undefined
}

/** The file type of an upload that may be sent to the reader; throws a plain "invalid" error when it is empty, too large or not a photo or PDF. */
export function checkReadableFile(bytes: Uint8Array): NonNullable<ReturnType<typeof sniffMimeType>> {
  if (bytes.length === 0) throw fail('invalid', 'The file is empty. Upload the document again')
  if (bytes.length > MAX_READ_BYTES) throw fail('invalid', 'The file is too large. Upload one under 10 MB')
  const mimeType = sniffMimeType(bytes)
  if (!mimeType) throw fail('invalid', 'Upload a photo (JPG, PNG) or a PDF of the document')
  return mimeType
}
