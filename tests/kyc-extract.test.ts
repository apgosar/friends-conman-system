import { describe, it, expect, vi } from 'vitest'
import { cleanAadhaar, cleanPan, cleanText, sniffMimeType, verhoeffValid } from '@/lib/kyc-fields'
import { extractKyc, MAX_KYC_BYTES, type KycGenerator } from '@/lib/kyc-extract'
import { HttpError } from '@/lib/errors'

// A valid Aadhaar-shaped number: the first 11 digits with the Verhoeff check digit worked out
const withCheckDigit = (base: string) => {
  for (let d = 0; d < 10; d++) if (verhoeffValid(base + d)) return base + d
  throw new Error('no check digit')
}
const AADHAAR = withCheckDigit('23456789012')

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } })) // the failure cases log: keep the test output quiet

const JPEG =new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
const reply = (body: unknown): KycGenerator => vi.fn(async () => JSON.stringify(body))

describe('kyc-fields', () => {
  it('accepts a PAN in any case or spacing and rejects one that is not shaped like a PAN', () => {
    expect(cleanPan(' abcde 1234 f ')).toBe('ABCDE1234F')
    expect(cleanPan('ABCDE12345')).toBeUndefined()
    expect(cleanPan('ABCD1234F')).toBeUndefined()
    expect(cleanPan(null)).toBeUndefined()
  })

  it('accepts an Aadhaar that passes the checksum and drops one with a misread digit', () => {
    expect(cleanAadhaar(AADHAAR)).toBe(AADHAAR)
    expect(cleanAadhaar(`${AADHAAR.slice(0, 4)} ${AADHAAR.slice(4, 8)} ${AADHAAR.slice(8)}`)).toBe(AADHAAR)
    const wrong = AADHAAR.slice(0, 5) + String((Number(AADHAAR[5]) + 1) % 10) + AADHAAR.slice(6)
    expect(cleanAadhaar(wrong)).toBeUndefined()
    expect(cleanAadhaar('1234 5678')).toBeUndefined()
    expect(cleanAadhaar('XXXX XXXX 1234')).toBeUndefined() // a masked number is not a number
  })

  it('checks the Verhoeff algorithm against its published example', () => {
    expect(verhoeffValid('2363')).toBe(true) // 236 with check digit 3
    expect(verhoeffValid('2364')).toBe(false)
  })

  it('tidies text and caps its length', () => {
    expect(cleanText('  Dhruval \n  Mehta ', 50)).toBe('Dhruval Mehta')
    expect(cleanText('   ', 50)).toBeUndefined()
    expect(cleanText('abcdef', 3)).toBe('abc')
    expect(cleanText(12, 3)).toBeUndefined()
  })

  it('recognises the file type from its bytes, not its name', () => {
    expect(sniffMimeType(JPEG)).toBe('image/jpeg')
    expect(sniffMimeType(new Uint8Array(Buffer.from('%PDF-1.7\n')))).toBe('application/pdf')
    expect(sniffMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png')
    expect(sniffMimeType(new Uint8Array(Buffer.from('MZ not an image')))).toBeUndefined()
  })
})

describe('extractKyc', () => {
  it('returns the PAN holder name and number', async () => {
    const generate = reply({ documentMatches: true, fullName: 'DHRUVAL MEHTA', number: 'abcde1234f', address: null })
    const result = await extractKyc('PAN', JPEG, generate)
    expect(result).toEqual({ data: { fullName: 'DHRUVAL MEHTA', panNumber: 'ABCDE1234F' }, missing: [] })
    expect(generate).toHaveBeenCalledWith({ docType: 'PAN', bytes: JPEG, mimeType: 'image/jpeg' })
  })

  it('returns the Aadhaar number without spaces, with the name and address', async () => {
    const result = await extractKyc('AADHAAR', JPEG, reply({ documentMatches: true, fullName: 'Dhruval Mehta', number: AADHAAR, address: 'C/O Hemant Mehta, Andheri, Mumbai 400053' }))
    expect(result.data).toEqual({ fullName: 'Dhruval Mehta', aadhaarNumber: AADHAAR, address: 'C/O Hemant Mehta, Andheri, Mumbai 400053' })
    expect(result.missing).toEqual([])
  })

  it('leaves out an Aadhaar number that fails its checksum and says it is missing', async () => {
    const wrong = AADHAAR.slice(0, 5) + String((Number(AADHAAR[5]) + 1) % 10) + AADHAAR.slice(6)
    const result = await extractKyc('AADHAAR', JPEG, reply({ documentMatches: true, fullName: 'Dhruval Mehta', number: wrong, address: null }))
    expect(result.data).toEqual({ fullName: 'Dhruval Mehta' })
    expect(result.missing).toEqual(['aadhaarNumber', 'address'])
  })

  it('refuses a document of the wrong kind', async () => {
    await expect(extractKyc('PAN', JPEG, reply({ documentMatches: false, fullName: null, number: null, address: null })))
      .rejects.toMatchObject({ kind: 'invalid', message: 'This does not look like a PAN card. Upload the PAN card' })
  })

  it('refuses a file with nothing readable on it', async () => {
    await expect(extractKyc('PAN', JPEG, reply({ documentMatches: true, fullName: null, number: 'garbled', address: null })))
      .rejects.toMatchObject({ kind: 'invalid' })
  })

  it('does not call Gemini for a file that is empty, too large or not an image or PDF', async () => {
    const generate = vi.fn()
    await expect(extractKyc('PAN', new Uint8Array(0), generate)).rejects.toBeInstanceOf(HttpError)
    await expect(extractKyc('PAN', new Uint8Array(MAX_KYC_BYTES + 1), generate)).rejects.toMatchObject({ kind: 'invalid' })
    await expect(extractKyc('PAN', new Uint8Array(Buffer.from('plain text file')), generate)).rejects.toMatchObject({ kind: 'invalid' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('answers a server error when the model does not return JSON', async () => {
    await expect(extractKyc('PAN', JPEG, async () => 'Sure! Here is the PAN')).rejects.toMatchObject({ kind: 'server' })
    await expect(extractKyc('PAN', JPEG, async () => '[1,2]')).rejects.toMatchObject({ kind: 'server' })
  })

  it('turns Google errors into plain messages and never passes the raw error on', async () => {
    const google = (status: number) => async () => { throw Object.assign(new Error('INTERNAL DETAIL project=secret'), { status }) }
    await expect(extractKyc('PAN', JPEG, google(429))).rejects.toMatchObject({ kind: 'tooManyRequests' })
    await expect(extractKyc('PAN', JPEG, google(403))).rejects.toMatchObject({ kind: 'unavailable' })
    const slow = await extractKyc('PAN', JPEG, google(504)).catch((e: HttpError) => e)
    expect(slow).toBeInstanceOf(HttpError)
    expect((slow as HttpError).message).not.toContain('secret')
  })
})
