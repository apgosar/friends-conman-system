import type { ReactNode } from 'react'

/** The title row at the top of a page: title and subtitle on the left, actions on the right (stacks on a phone). `eyebrow` is a row of badges above the title. */
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="min-w-0">
        {eyebrow && <div className="flex items-center gap-2 mb-1 wrap">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}
