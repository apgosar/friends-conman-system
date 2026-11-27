'use client'

import { CloudDownload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Alert, Button, Card, CardHeader, StatusBadge, TextField, useConfirm, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { formatDateTime } from '@/lib/format'

interface Overview {
  installed: string
  status: string
  version: string | null
  fromVersion: string | null
  requestedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  log: string | null
  lastCheckedAt: string | null
  checkOverdue: boolean
}

const ENDPOINT = '/api/settings/update'

/** Approve an update of this server. Shown only to the approver (the API answers null to anyone else). */
export default function ServerUpdateCard() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [version, setVersion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()
  const confirm = useConfirm()

  useEffect(() => {
    fetchJson<{ data: Overview | null }>(ENDPOINT)
      .then((d) => setOverview(d.data))
      .catch((err) => toast.error(errorMessage(err)))
  }, [toast])

  if (!overview) return null

  async function send(request: RequestInit, done: string) {
    setBusy(true)
    setError('')
    try {
      const d = await fetchJson<{ data: Overview }>(ENDPOINT, request)
      setOverview(d.data)
      setVersion('')
      toast.success(done)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function approve(e: React.FormEvent) {
    e.preventDefault()
    const ok = await confirm({
      title: `Approve v${version.trim().replace(/^v/i, '')}?`,
      message: 'The server installs it at its next daily job. The app is unavailable for about a minute while it switches, and the result is sent by email.',
      confirmLabel: 'Approve update',
    })
    if (ok) await send(jsonRequest('POST', { version }), 'Update approved')
  }

  const waiting = overview.status === 'APPROVED'
  const installing = overview.status === 'RUNNING'
  const when = overview.finishedAt ?? overview.startedAt ?? overview.requestedAt

  return (
    <Card>
      <CardHeader title={<><CloudDownload /> Server Update</>} actions={overview.status !== 'NONE' && <StatusBadge kind="update" status={overview.status} />} />
      <p className="text-secondary mb-4">
        Installed version: <strong>{overview.installed}</strong>. Nothing is installed until you approve a version here.
      </p>

      {overview.version && (
        <p className="mb-4">
          Version <strong>{overview.version}</strong>
          {when && <span className="text-muted"> · {formatDateTime(when)}</span>}
        </p>
      )}

      {overview.checkOverdue && (
        <Alert variant="warning" className="mb-4" noScroll>
          {overview.lastCheckedAt
            ? `The server has not asked for updates since ${formatDateTime(overview.lastCheckedAt)}. Check its daily job`
            : 'The server has not asked for updates yet. Its daily job needs to be set up for remote updates'}
        </Alert>
      )}

      {!installing && (
        <form onSubmit={approve} className="flex gap-3 items-end wrap">
          <TextField wrapperClassName="flex-1" label="Version to install" placeholder="v1.2.0" value={version} onChange={(e) => setVersion(e.target.value)} required />
          <Button type="submit" variant="primary" loading={busy}><CloudDownload /> Approve Update</Button>
          {waiting && <Button variant="ghost" disabled={busy} onClick={() => send({ method: 'DELETE' }, 'Approval cancelled')}>Cancel Approval</Button>}
        </form>
      )}
      {error && <Alert variant="danger" className="mt-4">{error}</Alert>}

      {overview.log && (
        <details className="mt-4">
          <summary className="cursor-pointer text-base text-secondary font-medium">What the server reported</summary>
          <pre data-scroll className="code-block mt-3">{overview.log}</pre>
        </details>
      )}
      {!overview.checkOverdue && overview.lastCheckedAt && <p className="text-sm text-muted mt-4 mb-0">Server last checked {formatDateTime(overview.lastCheckedAt)}</p>}
    </Card>
  )
}
