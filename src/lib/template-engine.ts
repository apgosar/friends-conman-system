import { TemplateContext } from '@/types'

/**
 * Replaces all {{variable.path}} placeholders in a template string
 * with values from the context object.
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const keys = path.trim().split('.')
    let value: unknown = context
    for (const key of keys) {
      if (value === null || value === undefined) return match
      value = (value as Record<string, unknown>)[key]
    }
    return value !== undefined && value !== null ? String(value) : match
  })
}

/**
 * Converts a number to Indian words (e.g. 150000 → "One Lakh Fifty Thousand")
 */
export function numberToWords(amount: number): string {
  if (amount === 0) return 'Zero'
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ]
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
  ]

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

/**
 * Formats a Decimal/number as Indian currency string.
 */
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * Formats a date as DD/MM/YYYY
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
