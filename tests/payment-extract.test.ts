import { describe, it, expect, vi } from 'vitest'
import { amountFromWords, cleanAmount, cleanChequeNumber, cleanDate, cleanMode, cleanTransactionRef } from '@/lib/payment-fields'
import { extractPayment, type PaymentGenerator } from '@/lib/payment-extract'
import { HttpError } from '@/lib/errors'

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } })) // the failure cases log: keep the test output quiet

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
const reply = (body: unknown): PaymentGenerator => vi.fn(async () => JSON.stringify(body))
const NOW = new Date('2026-11-20T10:00:00Z')

describe('payment-fields', () => {
  it('accepts an amount in figures, with or without commas, and rejects nonsense', () => {
    expect(cleanAmount(3675000)).toBe(3675000)
    expect(cleanAmount('₹ 36,75,000.50')).toBe(3675000.5)
    expect(cleanAmount('Rs. 1,250/-')).toBe(1250)
    expect(cleanAmount(0)).toBeUndefined()
    expect(cleanAmount(-5)).toBeUndefined()
    expect(cleanAmount('abc')).toBeUndefined()
    expect(cleanAmount(2_000_000_000)).toBeUndefined() // above Rs 100 crore: a misread
    expect(cleanAmount(null)).toBeUndefined()
  })

  it('accepts only a real date near today', () => {
    expect(cleanDate('2026-11-05', NOW)).toBe('2026-11-05')
    expect(cleanDate('2027-02-30', NOW)).toBeUndefined() // not a calendar date
    expect(cleanDate('05/11/2026', NOW)).toBeUndefined() // not in the asked shape
    expect(cleanDate('2019-11-05', NOW)).toBeUndefined() // over five years ago
    expect(cleanDate('2028-01-01', NOW)).toBeUndefined() // more than a year ahead
    expect(cleanDate('2026-12-30', NOW)).toBe('2026-12-30') // a post-dated cheque
  })

  it('accepts a six-digit cheque number and a UTR, and nothing else', () => {
    expect(cleanChequeNumber('004 521')).toBe('004521')
    expect(cleanChequeNumber(4521)).toBeUndefined() // five digits is a misread
    expect(cleanChequeNumber('00452A')).toBeUndefined()
    expect(cleanTransactionRef('hdfcr52026 1105 123456')).toBe('HDFCR520261105123456')
    expect(cleanTransactionRef('12')).toBeUndefined()
    expect(cleanTransactionRef('ABC/123?')).toBeUndefined()
  })

  it('accepts only the payment modes the screen offers', () => {
    expect(cleanMode('neft')).toBe('NEFT')
    expect(cleanMode('CHEQUE')).toBe('CHEQUE')
    expect(cleanMode('Bitcoin')).toBeUndefined()
  })

  it('works out an amount written in words, the Indian way', () => {
    expect(amountFromWords('Rupees Thirty Six Lakh Seventy Five Thousand Only')).toBe(3675000)
    expect(amountFromWords('Rupees Twelve Lakh Fifty Thousand Only')).toBe(1250000)
    expect(amountFromWords('Rs. One Crore Seventy Five Lakh Only')).toBe(17500000)
    expect(amountFromWords('Twenty-Five Thousand Five Hundred and Fifty')).toBe(25550)
    expect(amountFromWords('One Hundred and Twenty only')).toBe(120)
    expect(amountFromWords('Rupees Ten Thousand and Fifty Paise Only')).toBe(10000.5)
    expect(amountFromWords('Fifty Paise Only')).toBe(0.5)
  })

  it('gives no value when the words are not fully understood', () => {
    expect(amountFromWords('Rupees Thirty Six Lakhh Only')).toBeUndefined() // a misspelt scale word
    expect(amountFromWords('')).toBeUndefined()
    expect(amountFromWords(null)).toBeUndefined()
    expect(amountFromWords('Only')).toBeUndefined()
  })
})

describe('extractPayment', () => {
  const cheque = { documentMatches: true, amount: 3675000, amountInWords: 'Rupees Thirty Six Lakh Seventy Five Thousand Only', date: '2026-11-05', mode: 'CHEQUE', bankName: 'HDFC Bank', reference: '004521', payerName: 'Karan Bhatia' }

  it('reads a cheque whose figures and words agree', async () => {
    const generate = reply(cheque)
    const result = await extractPayment('CHEQUE', JPEG, generate, NOW)
    expect(result).toEqual({
      data: { amount: 3675000, paymentDate: '2026-11-05', mode: 'CHEQUE', bankName: 'HDFC Bank', referenceNumber: '004521', payerName: 'Karan Bhatia' },
      missing: [],
      notes: [],
    })
    expect(generate).toHaveBeenCalledWith({ docType: 'CHEQUE', bytes: JPEG, mimeType: 'image/jpeg' })
  })

  it('uses neither amount when the figures and the words disagree, and says so', async () => {
    const result = await extractPayment('CHEQUE', JPEG, reply({ ...cheque, amount: 3575000 }), NOW)
    expect(result.data.amount).toBeUndefined()
    expect(result.missing).toContain('amount')
    expect(result.notes[0]).toContain('do not match')
  })

  it('uses the words when the figures cannot be read', async () => {
    const result = await extractPayment('CHEQUE', JPEG, reply({ ...cheque, amount: null }), NOW)
    expect(result.data.amount).toBe(3675000)
  })

  it('leaves out a cheque number that is not six digits and asks for it', async () => {
    const result = await extractPayment('CHEQUE', JPEG, reply({ ...cheque, reference: '4521' }), NOW)
    expect(result.data.referenceNumber).toBeUndefined()
    expect(result.missing).toEqual(['referenceNumber'])
  })

  it('treats a demand draft as DD and any other cheque answer as a cheque', async () => {
    expect((await extractPayment('CHEQUE', JPEG, reply({ ...cheque, mode: 'DD' }), NOW)).data.mode).toBe('DD')
    expect((await extractPayment('CHEQUE', JPEG, reply({ ...cheque, mode: 'UPI' }), NOW)).data.mode).toBe('CHEQUE')
  })

  it('reads a UPI screenshot: mode, reference and amount, and does not ask for a bank name', async () => {
    const result = await extractPayment('SLIP', JPEG, reply({ documentMatches: true, amount: 500000, amountInWords: null, date: '2026-11-18', mode: 'UPI', bankName: null, reference: '432198765012', payerName: null }), NOW)
    expect(result.data).toEqual({ amount: 500000, paymentDate: '2026-11-18', mode: 'UPI', referenceNumber: '432198765012' })
    expect(result.missing).toEqual([])
  })

  it('refuses a file that is not the kind of document asked for', async () => {
    await expect(extractPayment('CHEQUE', JPEG, reply({ documentMatches: false }), NOW))
      .rejects.toMatchObject({ kind: 'invalid', message: 'This does not look like a cheque. Upload the cheque' })
  })

  it('is an error, not an empty success, when nothing could be read', async () => {
    await expect(extractPayment('SLIP', JPEG, reply({ documentMatches: true, amount: null, date: null, reference: null }), NOW)).rejects.toMatchObject({ kind: 'invalid' })
  })

  it('rejects an empty, oversized or non-image file before calling Gemini', async () => {
    const generate = reply(cheque)
    await expect(extractPayment('CHEQUE', new Uint8Array(0), generate, NOW)).rejects.toBeInstanceOf(HttpError)
    await expect(extractPayment('CHEQUE', new Uint8Array(Buffer.from('plain text')), generate, NOW)).rejects.toMatchObject({ kind: 'invalid' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('turns an answer that is not JSON, and Google errors, into plain messages', async () => {
    await expect(extractPayment('CHEQUE', JPEG, async () => 'Here is the cheque', NOW)).rejects.toMatchObject({ kind: 'server' })
    const google = (status: number): PaymentGenerator => async () => { throw Object.assign(new Error('secret internals'), { status }) }
    await expect(extractPayment('CHEQUE', JPEG, google(429), NOW)).rejects.toMatchObject({ kind: 'tooManyRequests' })
    const slow = await extractPayment('CHEQUE', JPEG, google(503), NOW).catch((e: unknown) => e)
    expect(slow).toMatchObject({ kind: 'unavailable' })
    expect((slow as HttpError).message).not.toContain('secret')
  })
})
