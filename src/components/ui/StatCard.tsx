import type { CSSProperties, ReactNode } from 'react'

/** A headline number with a label. `accent` is any CSS colour or gradient for the top edge. */
export function StatCard({ label, value, note, accent, icon }: { label: ReactNode; value: ReactNode; note?: ReactNode; accent?: string; icon?: ReactNode }) {
  return (
    <div className="stat-card" style={accent ? ({ '--accent-gradient': accent } as CSSProperties) : undefined}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-sub">{note}</div>}
      {icon && <div className="stat-icon" aria-hidden="true">{icon}</div>}
    </div>
  )
}
