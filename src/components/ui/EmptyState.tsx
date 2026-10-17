import type { ReactNode } from 'react'
import { cn } from './cn'

/** "Nothing here yet", the same everywhere. Use inside a card, or as a table row via <EmptyRow>. */
export function EmptyState({ title, children, dashed, className }: { title?: ReactNode; children?: ReactNode; dashed?: boolean; className?: string }) {
  return (
    <div className={cn('empty-state', dashed && 'empty-state-dashed', className)}>
      {title && <div className="empty-state-title">{title}</div>}
      {children}
    </div>
  )
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan}><EmptyState>{children}</EmptyState></td>
    </tr>
  )
}
