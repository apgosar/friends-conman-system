import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export function Card({ className, flush, ...rest }: HTMLAttributes<HTMLDivElement> & { /** No padding: for a table that fills the card. */ flush?: boolean }) {
  return <div className={cn('card', flush && 'p-0 overflow-hidden', className)} {...rest} />
}

export function CardHeader({ title, actions, className }: { title: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('card-header', className)}>
      <h3 className="card-title">{title}</h3>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}
