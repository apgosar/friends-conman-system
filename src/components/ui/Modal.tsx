'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

export interface ModalProps {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  size?: ModalSize
  /** Buttons for the bottom bar. Put the primary action last. */
  footer?: ReactNode
  /** When false the backdrop click and Escape do nothing (e.g. while saving). */
  dismissible?: boolean
  children: ReactNode
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Page scroll is locked while any modal is open; a counter lets modals stack (a confirm on top of a form).
let openModals = 0

/**
 * The one dialog. It is rendered in a portal on <body>, traps keyboard focus, closes on Escape or a click outside,
 * locks page scroll, returns focus to what opened it, and is announced to screen readers. On a phone it slides up as a
 * bottom sheet (see responsive.css). Use it as `{open && <Modal title="…" onClose={…}>…</Modal>}`.
 */
export function Modal({ title, subtitle, onClose, size = 'md', footer, dismissible = true, children }: ModalProps) {
  const [mounted, setMounted] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)
  // keep the latest callbacks without re-running the focus/scroll-lock effect on every render
  useEffect(() => {
    onCloseRef.current = onClose
    dismissibleRef.current = dismissible
  })

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    openModals += 1
    if (openModals === 1) document.body.style.overflow = 'hidden'

    const dialog = dialogRef.current
    // focus the first field, else the dialog itself
    const first = dialog?.querySelector<HTMLElement>('[autofocus], .modal-body input, .modal-body select, .modal-body textarea') ?? dialog?.querySelector<HTMLElement>(FOCUSABLE)
    if (!dialog?.contains(document.activeElement)) (first ?? dialog)?.focus() // something may have taken focus already (autoFocus)

    const onKeyDown = (e: KeyboardEvent) => {
      // only the top-most modal reacts
      const all = document.querySelectorAll('.modal-overlay')
      if (all[all.length - 1] !== dialog?.parentElement) return
      if (e.key === 'Escape' && dismissibleRef.current) {
        e.stopPropagation()
        onCloseRef.current()
      } else if (e.key === 'Tab' && dialog) {
        const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
        if (items.length === 0) return e.preventDefault()
        const [head, tail] = [items[0], items[items.length - 1]]
        if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus() }
        else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      openModals -= 1
      if (openModals === 0) document.body.style.overflow = ''
      previouslyFocused?.focus?.()
    }
  }, [mounted])

  if (!mounted) return null

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget && dismissible) onClose() }}
    >
      <div ref={dialogRef} className={cn('modal', size !== 'md' && `modal-${size}`)} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="modal-header">
          <div className="min-w-0">
            <h2 className="modal-title" id={titleId}>{title}</h2>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close" disabled={!dismissible}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
