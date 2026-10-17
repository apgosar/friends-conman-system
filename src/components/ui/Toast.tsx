'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './Modal'
import { Button } from './Button'

type ToastKind = 'success' | 'error' | 'warning' | 'info'
interface ToastItem { id: number; kind: ToastKind; message: string }

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  warning: (message: string) => void
  info: (message: string) => void
}

export interface ConfirmOptions {
  title?: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button, for deleting / cancelling things. */
  danger?: boolean
}

const ToastContext = createContext<ToastApi | null>(null)
const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null)

const TOAST_MS: Record<ToastKind, number> = { success: 4000, info: 5000, warning: 7000, error: 9000 }
const ICON: Record<ToastKind, string> = { success: '✓', error: '⚠', warning: '⚠', info: 'ℹ' }

/**
 * App-wide feedback, mounted once in AppShell:
 *  - useToast():   toast.success('Saved') / toast.error(message): replaces alert()
 *  - useConfirm(): if (await confirm({ message: 'Delete this?', danger: true })) …: replaces confirm()
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  const nextId = useRef(1)
  const [mounted, setMounted] = useState(false) // portals only after hydration, or server and client markup differ
  useEffect(() => setMounted(true), [])

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++
    setToasts((t) => [...t.slice(-3), { id, kind, message }])
    setTimeout(() => dismiss(id), TOAST_MS[kind])
  }, [dismiss])

  const api = useMemo<ToastApi>(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    warning: (m) => push('warning', m),
    info: (m) => push('info', m),
  }), [push])

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })), [])
  const settle = (ok: boolean) => { pending?.resolve(ok); setPending(null) }

  return (
    <ToastContext.Provider value={api}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        {mounted && createPortal(
          <div className="toast-container" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
                <span aria-hidden="true">{ICON[t.kind]}</span>
                <div className="alert-body">{t.message}</div>
                <button type="button" className="alert-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
              </div>
            ))}
          </div>,
          document.body,
        )}
        {pending && (
          <Modal
            title={pending.title ?? 'Are you sure?'}
            size="sm"
            onClose={() => settle(false)}
            footer={
              <>
                <Button onClick={() => settle(false)}>{pending.cancelLabel ?? 'Cancel'}</Button>
                <Button variant={pending.danger ? 'danger' : 'primary'} onClick={() => settle(true)} autoFocus>{pending.confirmLabel ?? 'Confirm'}</Button>
              </>
            }
          >
            <div className="text-base text-secondary">{pending.message}</div>
          </Modal>
        )}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <FeedbackProvider> (it is mounted in AppShell)')
  return ctx
}

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside <FeedbackProvider> (it is mounted in AppShell)')
  return ctx
}
