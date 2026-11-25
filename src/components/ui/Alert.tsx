'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { INVALID_SELECTOR } from '@/lib/client/forms'
import { cn } from './cn'

export type AlertVariant = 'danger' | 'warning' | 'info' | 'success'

const ICON: Record<AlertVariant, string> = { danger: '⚠', warning: '⚠', info: 'ℹ', success: '✓' }

/**
 * An inline message inside a page or form. For "it worked / it failed" feedback after an action, use useToast() instead.
 * A danger alert scrolls itself into view when it appears, so an error at the top of a long form is never missed
 * (unless a field is already marked red: then that field is what gets scrolled to). It scrolls when it appears, and again only
 * when its message (a plain text) changes: never because the screen around it was redrawn. A message that follows what the
 * person is typing (the totals of a payment plan do not add up yet) passes `noScroll`, or the page would jump on every key.
 */
export function Alert({ variant = 'info', title, children, onClose, className, noScroll }: { variant?: AlertVariant; title?: ReactNode; children?: ReactNode; onClose?: () => void; className?: string; noScroll?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const message = typeof children === 'string' ? children : null
  useEffect(() => {
    if (variant !== 'danger' || noScroll || document.querySelector(INVALID_SELECTOR)) return
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [variant, noScroll, message])
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
