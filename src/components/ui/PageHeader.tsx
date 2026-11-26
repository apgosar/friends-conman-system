import type { ReactNode } from 'react'

/**
 * The row under the top bar: what the page says about itself on the left, its actions on the right (stacks on a phone).
 * It has no title: the title is in the top bar (TopNav) and is shown once. `eyebrow` is a row of badges above the text.
 */
export function PageHeader({ subtitle, actions, eyebrow }: { subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="page-header">
      {(eyebrow || subtitle) && (
        <div className="min-w-0">
          {eyebrow && <div className="flex items-center gap-2 mb-1 wrap">{eyebrow}</div>}
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      )}
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}
