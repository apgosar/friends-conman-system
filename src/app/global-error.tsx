'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import '@fontsource-variable/inter'
import '@fontsource-variable/plus-jakarta-sans'
import '@/styles/globals.css'

/** The last resort: the root layout itself failed, so this page brings its own <html> and <body>. */
export default function GlobalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => { Sentry.captureException(error) }, [error])
  return (
    <html lang="en">
      <body>
        <div className="auth-page">
          <div className="error-state" role="alert">
            <div className="error-state-icon" aria-hidden="true">⚠</div>
            <h1 className="error-state-title">Something went wrong</h1>
            <p className="error-state-text">Something went wrong on our side. Please try again</p>
            {error.digest && <p className="error-state-ref">Reference: <span className="mono">{error.digest}</span></p>}
            <button type="button" className="btn btn-primary" onClick={() => unstable_retry()}>Try again</button>
          </div>
        </div>
      </body>
    </html>
  )
}
