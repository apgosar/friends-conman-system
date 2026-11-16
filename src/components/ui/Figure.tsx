import { Fragment, type CSSProperties } from 'react'
import { cn } from './cn'

// Advance width of the display font's glyphs in em (measured on Plus Jakarta Sans, rounded up), so a figure can be
// sized to its box before the browser lays it out
const glyphEm = (ch: string) => (/\d/.test(ch) ? 0.64 : /[,.\s]/.test(ch) ? 0.41 : 0.66)
/** The width of `text` in em at the figure's font, rounded up (never under 1) */
export const figureEm = (text: string) => Math.max([...text].reduce((sum, ch) => sum + glyphEm(ch), 0), 1)

/**
 * A headline figure (an amount or a count, already formatted) that always stays inside its box. It is drawn as large
 * as the box allows, up to the size given; if it still cannot fit at a readable size it wraps at the digit-group
 * commas (₹1,64,35,46,|632.36), so it never runs out of its card or gets cut off, whatever the screen or text size.
 */
export function Figure({ children, size = 'lg', className }: { children: string | number; size?: 'lg' | 'md'; className?: string }) {
  const text = String(children)
  return (
    <div className={cn('figure-box', className)}>
      <div className={cn('figure', size === 'md' && 'figure-md')} style={{ '--figure-em': figureEm(text).toFixed(2) } as CSSProperties}>
        {text.split(',').map((part, i) => (
          <Fragment key={i}>{i > 0 && <>,<wbr /></>}{part}</Fragment>
        ))}
      </div>
    </div>
  )
}
