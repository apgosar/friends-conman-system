import type { CSSProperties } from 'react'

/** Colours and styles every chart uses, so all of them look alike and follow the theme tokens in styles/tokens.css. */
export const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)']
/** How late a bucket of receivables is, from fine to severe; the API and dashboard send a tone, the chart picks the colour. */
export type AgingTone = 'ok' | 'warn' | 'orange' | 'danger' | 'severe'
export const AGING_TONE_COLOR: Record<AgingTone, string> = {
  ok: 'var(--chart-2)',
  warn: 'var(--chart-aging-1)',
  orange: 'var(--chart-aging-2)',
  danger: 'var(--chart-aging-3)',
  severe: 'var(--chart-aging-4)',
}

export const GRID_STROKE = 'var(--chart-grid)'
export const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 11 }

export const TOOLTIP_STYLE: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: 8,
  fontSize: 13,
}
/** The highlight behind a hovered bar (recharts defaults to a light grey that glares on the dark theme). */
export const TOOLTIP_CURSOR = { fill: 'var(--bg-muted)', fillOpacity: 0.4 }
export const TOOLTIP_LABEL_STYLE: CSSProperties = { color: 'var(--text-primary)', fontWeight: 600 }
export const TOOLTIP_ITEM_STYLE: CSSProperties = { color: 'var(--text-secondary)' }

/** Compact rupees for chart axes and tooltips: ₹1.20Cr, ₹3.50L, ₹4.2K. */
export function formatRupeesCompact(val: number): string {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)}Cr`
  if (val >= 100000) return `₹${(val / 100000).toFixed(2)}L`
  if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`
  return `₹${val}`
}
