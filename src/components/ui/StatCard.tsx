import type { CSSProperties, ReactNode } from 'react'
import { Figure } from './Figure'

/** A headline number with a label. `accent` is any CSS colour or gradient for the top edge. The value always fits the card (see Figure). */
export function StatCard({ label, value, note, accent, icon }: { label: ReactNode; value: string | number; note?: ReactNode; accent?: string; icon?: ReactNode }) {
  return (
    <div className="stat-card" style={accent ? ({ '--accent-gradient': accent } as CSSProperties) : undefined}>
      <div className="stat-label">{label}</div>
      <Figure className="stat-value">{value}</Figure>
      {note && <div className="stat-sub">{note}</div>}
      {icon && <div className="stat-icon" aria-hidden="true">{icon}</div>}
    </div>
  )
}
