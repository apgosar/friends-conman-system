import type { ReactNode } from 'react'
import { cn } from './cn'

export type AlertVariant = 'danger' | 'warning' | 'info' | 'success'

const ICON: Record<AlertVariant, string> = { danger: '⚠', warning: '⚠', info: 'ℹ', success: '✓' }

/** An inline message inside a page or form. For "it worked / it failed" feedback after an action, use useToast() instead. */
export function Alert({ variant = 'info', title, children, onClose, className }: { variant?: AlertVariant; title?: ReactNode; children?: ReactNode; onClose?: () => void; className?: string }) {
  return (
    <div className={cn('alert', `alert-${variant}`, className)} role={variant === 'danger' ? 'alert' : 'status'}>
      <span aria-hidden="true">{ICON[variant]}</span>
      <div className="alert-body">
        {title && <div className="alert-title">{title}</div>}
        {children}
      </div>
      {onClose && <button type="button" className="alert-close" onClick={onClose} aria-label="Dismiss">×</button>}
    </div>
  )
}
