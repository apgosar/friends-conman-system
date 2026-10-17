'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import TopNav from '@/components/layout/TopNav'
import { Button, ButtonLink, ErrorState, SERVER_ERROR_TEXT } from '@/components/ui'

/** Any page inside the app shell that throws while rendering lands here: the sidebar and top bar stay, the content is replaced. */
export default function AdminError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => { Sentry.captureException(error) }, [error])

  return (
    <>
      <TopNav title="Something went wrong" subtitle="This page could not be shown" />
      <div className="admin-content">
        <ErrorState
          title="This page could not be shown"
          reference={error.digest}
          actions={
            <>
              <Button variant="primary" onClick={() => unstable_retry()}>Try again</Button>
              <ButtonLink href="/dashboard">Go to the dashboard</ButtonLink>
            </>
          }
        >
          {SERVER_ERROR_TEXT}. If it keeps happening, tell your administrator the reference below.
        </ErrorState>
      </div>
    </>
  )
}
