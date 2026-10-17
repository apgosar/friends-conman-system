'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button, ErrorState, SERVER_ERROR_TEXT } from '@/components/ui'

/** Errors outside the app shell (sign-in page and similar). */
export default function RootError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => { Sentry.captureException(error) }, [error])
  return (
    <div className="auth-page">
      <ErrorState title="Something went wrong" reference={error.digest} actions={<Button variant="primary" onClick={() => unstable_retry()}>Try again</Button>}>
        {SERVER_ERROR_TEXT}
      </ErrorState>
    </div>
  )
}
