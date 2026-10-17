'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { INVALID_SELECTOR } from '@/lib/client/forms'
import { cn } from './cn'

export type AlertVariant = 'danger' | 'warning' | 'info' | 'success'

const ICON: Record<AlertVariant, string> = { danger: '⚠', warning: '⚠', info: 'ℹ', success: '✓' }

/**
 * An inline message inside a page or form. For "it worked / it failed" feedback after an action, use useToast() instead.
 * A danger alert scrolls itself into view when it appears, so an error at the top of a long form is never missed
 * (unless a field is already marked red: then that field is what gets scrolled to).
 */
export function Alert({ variant = 'info', title, children, onClose, className }: { variant?: AlertVariant; title?: ReactNode; children?: ReactNode; onClose?: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (variant !== 'danger' || document.querySelector(INVALID_SELECTOR)) return
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [variant, children])
  return (
    <div ref={ref} className={cn('alert', `alert-${variant}`, className)} role={variant === 'danger' ? 'alert' : 'status'}>
      <span aria-hidden="true">{ICON[variant]}</span>
      <div className="alert-body">
        {title && <div className="alert-title">{title}</div>}
        {children}
      </div>
      {onClose && <button type="button" className="alert-close" onClick={onClose} aria-label="Dismiss">×</button>}
    </div>
  )
}
