/**
 * The only place numbers, money and dates are turned into text. UI, API, PDFs, emails and WhatsApp all call these, so a
 * rupee amount or a date reads the same wherever it appears. Indian digit grouping (12,34,567), DD/MM/YYYY dates.
 * Client-safe (no server imports).
 */
const LOCALE = 'en-IN'

type DateInput = Date | string | number

const asDate = (d: DateInput) => (d instanceof Date ? d : new Date(d))
const asNumber = (n: number | string | null | undefined) => (typeof n === 'number' ? n : Number(n ?? 0))

/** 1234567.5 -> "12,34,567.5" (up to `maxDecimals` places, no trailing zeros) */
export const formatNumber = (n: number | string | null | undefined, maxDecimals = 2): string =>
  asNumber(n).toLocaleString(LOCALE, { maximumFractionDigits: maxDecimals })

/** 1234567.5 -> "12,34,567.50": fixed two decimals, no symbol (letters, receipts, tables of amounts) */
export const formatMoney = (n: number | string | null | undefined): string =>
  asNumber(n).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 1234567.5 -> "₹12,34,567.5": inline amounts in sentences and badges */
export const formatRupees = (n: number | string | null | undefined, maxDecimals = 2): string => `₹${formatNumber(n, maxDecimals)}`

/** 1234567.5 -> "₹12,34,567.50": the standard way to show a money value on screen */
export function formatCurrency(amount: number | string, maxDecimals = 2): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'INR', maximumFractionDigits: maxDecimals }).format(num)
}

/** 17/10/2026 */
export const formatDate = (date: DateInput): string => asDate(date).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' })

/** 17 Oct */
export const formatDateShort = (date: DateInput): string => asDate(date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })

/** 17/10/2026, 3:45:12 pm */
export const formatDateTime = (date: DateInput): string => asDate(date).toLocaleString(LOCALE)

/** Oct 26 */
export const formatMonthYear = (date: DateInput): string => asDate(date).toLocaleString(LOCALE, { month: 'short', year: '2-digit' })

/** 17 Oct 2026, 03:45 pm: build stamps and log headers */
export const formatDateTimeLong = (date: DateInput): string =>
  asDate(date).toLocaleString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Converts a number to Indian words (150000 -> "One Lakh Fifty Thousand Only"). */
export function numberToWords(amount: number): string {
  if (amount === 0) return 'Zero'
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ]
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function belowThousand(n: number): string {
    if (n < 20) return ones[n]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + belowThousand(n % 100) : '')
  }

  const crore = Math.floor(amount / 10000000)
  const lakh = Math.floor((amount % 10000000) / 100000)
  const thousand = Math.floor((amount % 100000) / 1000)
  const rest = Math.floor(amount % 1000)

  let result = ''
  if (crore) result += belowThousand(crore) + ' Crore '
  if (lakh) result += belowThousand(lakh) + ' Lakh '
  if (thousand) result += belowThousand(thousand) + ' Thousand '
  if (rest) result += belowThousand(rest)
  return result.trim() + ' Only'
}
