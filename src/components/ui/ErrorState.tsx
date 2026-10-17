import type { ReactNode } from 'react'
import { ERROR_KINDS } from '@/lib/errors'

/** A full-panel message for "this page failed" / "this page does not exist", the same on every screen. */
export function ErrorState({ title, children, reference, actions }: { title: ReactNode; children?: ReactNode; reference?: string; actions?: ReactNode }) {
  return (
    <div className="error-state" role="alert">
      <div className="error-state-icon" aria-hidden="true">⚠</div>
      <h1 className="error-state-title">{title}</h1>
      {children && <p className="error-state-text">{children}</p>}
      {reference && <p className="error-state-ref">Reference: <span className="mono">{reference}</span></p>}
      {actions && <div className="flex gap-3 justify-center wrap">{actions}</div>}
    </div>
  )
}

export const SERVER_ERROR_TEXT = ERROR_KINDS.server.message
