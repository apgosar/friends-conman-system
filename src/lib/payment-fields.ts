/**
 * Cleaning and checking what the document reader returns for a cheque or a bank slip.
 *
 * Like a PAN or Aadhaar (kyc-fields.ts), nothing the model returns is trusted as it is: an amount must be a sensible number
 * (and agree with the amount written in words, as a bank itself checks), a date must be a real date near today, a cheque
 * number must be six digits. A value that does not pass is left out rather than pre-filled wrong. Pure functions, no I/O.
 */
import { PAYMENT_MODE_VALUES, type PaymentMode } from '@/lib/status'

/** The most one cheque or transfer can be here: Rs 100 crore. Anything above is a misread, not a payment. */
export const MAX_PAYMENT_AMOUNT = 1_000_000_000

/** A rupee amount (figures, possibly as text with commas or a rupee sign), or undefined when it is not a positive, sensible amount. */
export function cleanAmount(raw: unknown): number | undefined {
  const value = typeof raw === 'string' ? Number(raw.replace(/[₹,\s]|rs\.?|\/-/gi, '')) : raw
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MAX_PAYMENT_AMOUNT) return undefined
  return Math.round(value * 100) / 100
}

/** A date as YYYY-MM-DD, only when it is a real calendar date within five years back and one year ahead of `now`. */
export function cleanDate(raw: unknown, now: Date = new Date()): string | undefined {
  if (typeof raw !== 'string') return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (!m) return undefined
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return undefined // 31 February
  const earliest = Date.UTC(now.getUTCFullYear() - 5, now.getUTCMonth(), now.getUTCDate())
  const latest = Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate())
  return date.getTime() >= earliest && date.getTime() <= latest ? raw.trim() : undefined
}

/** A cheque number: the six digits of the MICR band. */
export function cleanChequeNumber(raw: unknown): string | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined
  const digits = String(raw).replace(/\s/g, '')
  return /^\d{6}$/.test(digits) ? digits : undefined
}

/** A UTR or transaction reference: letters and digits only, 6 to 35 of them, in capitals. */
export function cleanTransactionRef(raw: unknown): string | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined
  const ref = String(raw).replace(/[\s-]/g, '').toUpperCase()
  return /^[A-Z0-9]{6,35}$/.test(ref) ? ref : undefined
}

/** One of the payment modes the Record Payment screen offers, or undefined. */
export function cleanMode(raw: unknown): PaymentMode | undefined {
  if (typeof raw !== 'string') return undefined
  const mode = raw.trim().toUpperCase()
  return (PAYMENT_MODE_VALUES as readonly string[]).includes(mode) ? (mode as PaymentMode) : undefined
}

// ── The amount in words ──────────────────────────────────────────────────────

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}
const SCALES: Record<string, number> = { thousand: 1_000, lakh: 100_000, lakhs: 100_000, lac: 100_000, lacs: 100_000, crore: 10_000_000, crores: 10_000_000 }
const FILLER = new Set(['rupees', 'rupee', 'rs', 'inr', 'only', 'of', 'the', 'a'])

/** Words such as "thirty six lakh seventy five thousand" as a number; undefined when any word is not understood (never a guess). */
function wordsToNumber(tokens: string[]): number | undefined {
  let total = 0
  let current = 0
  let seen = false
  for (const t of tokens) {
    if (t in UNITS) { current += UNITS[t]; seen = true }
    else if (t === 'hundred') { current = (current || 1) * 100; seen = true }
    else if (t in SCALES) { total += (current || 1) * SCALES[t]; current = 0; seen = true }
    else return undefined
  }
  return seen ? total + current : undefined
}

/**
 * The value of an amount written in words on a cheque, in the Indian style: "Rupees Thirty Six Lakh Seventy Five Thousand Only",
 * with optional paise ("... and Fifty Paise Only"). Undefined when it cannot be understood fully.
 */
export function amountFromWords(raw: unknown): number | undefined {
  if (typeof raw !== 'string') return undefined
  const text = raw.toLowerCase().replace(/[-,./]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  let tokens = text.split(' ').filter((t) => !FILLER.has(t))
  let paise = 0
  const p = tokens.findIndex((t) => t === 'paise' || t === 'paisa')
  if (p >= 0) {
    const head = tokens.slice(0, p)
    const and = head.lastIndexOf('and')
    const paiseWords = and >= 0 ? head.slice(and + 1) : head
    const value = wordsToNumber(paiseWords)
    if (value === undefined || value >= 100) return undefined
    paise = value
    tokens = and >= 0 ? head.slice(0, and) : []
    if (tokens.length === 0) return paise / 100
  }
  const rupees = wordsToNumber(tokens.filter((t) => t !== 'and'))
  return rupees === undefined ? undefined : rupees + paise / 100
}
