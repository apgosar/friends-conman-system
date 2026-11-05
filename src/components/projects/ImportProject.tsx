'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, ButtonLink, Card, CardHeader, Input, TextField, useConfirm, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { plural } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { CHUNK_BYTES, PACKAGE_EXTENSION } from '@/lib/project-transfer/constants'

interface Preview {
  project: { name: string; city: string; type: string; status: string }
  company: { name: string; onThisServer: boolean }
  exportedAt: string
  appVersion: string
  counts: { label: string; value: number }[]
  conflicts: string[]
  notes: string[]
}
interface Result { projectId: string; name: string; files: { saved: number; missing: number } }
interface Upload { id: string; chunks: number; file: File }

/**
 * Super Admin only. Brings in a project exported from another server (Export Project). The file goes up in pieces
 * (it can be larger than one request may be), is opened with the passphrase, and shows what it holds before anything is saved.
 */
export default function ImportProject() {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [file, setFile] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [upload, setUpload] = useState<Upload | null>(null)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState<'checking' | 'importing' | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  const discard = (u: Upload | null) => {
    if (u) void fetchJson('/api/projects/import', jsonRequest('DELETE', { uploadId: u.id, chunks: u.chunks })).catch(() => undefined) // best effort: nothing waits on it
  }

  const choose = (next: File | null) => {
    discard(upload)
    setUpload(null); setPreview(null); setError(''); setProgress(0)
    setFile(next)
  }

  const check = async () => {
    if (!file) return
    setBusy('checking'); setError(''); setPreview(null)
    try {
      let current = upload?.file === file ? upload : null
      if (!current) {
        const id = crypto.randomUUID()
        const chunks = Math.max(1, Math.ceil(file.size / CHUNK_BYTES))
        setProgress(0)
        for (let i = 0; i < chunks; i++) {
          await fetchJson(`/api/projects/import/chunk?uploadId=${id}&index=${i}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES) })
          setProgress(Math.round(((i + 1) / chunks) * 100))
        }
        current = { id, chunks, file }
        setUpload(current)
      }
      const res = await fetchJson('/api/projects/import', jsonRequest('POST', { uploadId: current.id, chunks: current.chunks, passphrase, confirm: false }))
      setPreview(res.preview as Preview)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const run = async () => {
    if (!upload || !preview) return
    const sales = preview.counts.find((c) => c.label === 'Sales')?.value ?? 0
    const ok = await confirm({
      title: `Import ${preview.project.name}?`,
      message: `It is added to this server with its ${plural(sales, 'sale')}, payments and documents, next to what is already here. Nothing is replaced. If anything looks wrong afterwards, you can delete the imported project from its page.`,
      confirmLabel: 'Import project',
    })
    if (!ok) return
    setBusy('importing'); setError('')
    try {
      const res = await fetchJson('/api/projects/import', jsonRequest('POST', { uploadId: upload.id, chunks: upload.chunks, passphrase, confirm: true }))
      setResult(res.result as Result)
      setUpload(null); setPreview(null); setFile(null); setPassphrase('')
      toast.success('Project imported')
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (result) {
    return (
      <Card>
        <Alert variant="success" title={`${result.name} is now on this server`}>
          <p className="mb-2">
            {result.files.missing > 0
              ? `${plural(result.files.saved, 'stored file')} came across. ${plural(result.files.missing, 'file')} listed in the project ${result.files.missing === 1 ? 'was' : 'were'} already missing on the old server.`
              : `${plural(result.files.saved, 'stored file')} came across.`}
          </p>
          <p className="m-0">
            This is a copy: the project is still on the old server. If you are moving it for good, check it here first and then delete it there,
            otherwise buyers can get payment reminders from both servers.
          </p>
        </Alert>
        <div className="flex gap-3 mt-4 wrap">
          <ButtonLink href={`/projects/${result.projectId}`} variant="primary">Open the project</ButtonLink>
          <Button onClick={() => setResult(null)}>Import another</Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 max-w-xl">
      <Card>
        <CardHeader title="1. Choose the file" />
        <p className="form-hint mb-4">
          Choose a file made with Export Project on the other server ({PACKAGE_EXTENSION}), and type the passphrase it was locked with.
        </p>
        <div className="flex dir-col gap-3">
          <Input type="file" accept={PACKAGE_EXTENSION} aria-label="Project file" disabled={busy !== null} onChange={(e) => choose(e.target.files?.[0] ?? null)} />
          <TextField label="Passphrase" type="password" autoComplete="off" value={passphrase} onChange={(e) => { setPassphrase(e.target.value); setPreview(null) }} />
          {busy === 'checking' && progress < 100 && (
            <div className="progress-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}
          {error && <Alert variant="danger">{error}</Alert>}
          <div>
            <Button variant={preview ? 'secondary' : 'primary'} disabled={!file || !passphrase} loading={busy === 'checking'} onClick={check}>
              {preview ? 'Check again' : 'Open the file'}
            </Button>
          </div>
        </div>
      </Card>

      {preview && (
        <Card>
          <CardHeader title="2. Check what is in it" />
          <h3 className="mb-1 text-md">{preview.project.name}</h3>
          <p className="text-sm text-muted mb-4">
            {preview.project.city} · exported {formatDateTime(preview.exportedAt)} from Neev CMS v{preview.appVersion}
          </p>
          <div className="grid grid-3 gap-2 mb-4">
            {preview.counts.map((c) => (
              <div key={c.label} className="text-center">
                <div className="font-bold text-lg">{c.value}</div>
                <div className="text-xs text-muted">{c.label}</div>
              </div>
            ))}
          </div>
          {preview.conflicts.map((c) => <Alert key={c} variant="danger" className="mb-3">{c}</Alert>)}
          {preview.notes.map((n) => <Alert key={n} variant="info" className="mb-3">{n}</Alert>)}
          <Button variant="primary" loading={busy === 'importing'} disabled={preview.conflicts.length > 0} onClick={run}>Import project</Button>
        </Card>
      )}
    </div>
  )
}
