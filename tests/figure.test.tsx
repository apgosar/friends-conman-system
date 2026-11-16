import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Figure, figureEm } from '@/components/ui/Figure'
import { StatCard } from '@/components/ui'
import { formatCurrency } from '@/lib/format'

// A headline figure must stay inside its card on any screen (it once ran out of the dashboard cards on a phone).
// Figure sizes the number from its width in em, and wraps at the digit-group commas when it cannot fit.

// Advance widths measured in the browser on the display font (Plus Jakarta Sans 800): digit, comma, full stop, ₹
const MEASURED = { digit: 0.633, comma: 0.386, dot: 0.408, rupee: 0.6 }
const measured = (text: string) => [...text].reduce((sum, ch) =>
  sum + (/\d/.test(ch) ? MEASURED.digit : ch === ',' ? MEASURED.comma : ch === '.' ? MEASURED.dot : MEASURED.rupee), 0)

describe('Figure', () => {
  it.each([0, 999.5, 80_85_000, 1_64_35_46_632.36, 99_99_99_99_99_999.99])('never thinks %s is narrower than it is (else the number would be drawn too big for its box)', (amount) => {
    const text = formatCurrency(amount)
    expect(figureEm(text)).toBeGreaterThanOrEqual(measured(text))
  })

  it('can wrap a long amount after each comma, and keeps the text as it is', () => {
    const html = renderToStaticMarkup(<Figure>{'₹1,64,35,46,632.36'}</Figure>)
    expect(html.match(/,<wbr\/>/g)).toHaveLength(4)
    expect(html.replace(/<[^>]+>/g, '')).toBe('₹1,64,35,46,632.36')
  })

  it('tells the CSS how wide the text is', () => {
    expect(renderToStaticMarkup(<Figure>{12}</Figure>)).toMatch(/--figure-em:\s*1\.28/)
  })

  it('is what StatCard draws its value with', () => {
    const html = renderToStaticMarkup(<StatCard label="Total Outstanding" value="₹80,85,000.00" />)
    expect(html).toContain('class="figure-box stat-value"')
    expect(html).toContain('<wbr/>')
  })
})
