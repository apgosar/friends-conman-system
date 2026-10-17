'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, ButtonLink, Input } from '@/components/ui'
import { ApiError, errorMessage, fetchJson } from '@/lib/client/api'
import { plural } from '@/lib/errors'

export default function ExcelImport({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string; details?: string[] } | null>(null)

  const upload = async () => {
    if (!file) return
    setBusy(true)
    setResult(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetchJson(`/api/projects/${projectId}/structure/import`, { method: 'POST', body })
      const skipped = res.skipped.length ? ` ${plural(res.skipped.length, 'unit number')} already existed and ${res.skipped.length === 1 ? 'was' : 'were'} skipped.` : ''
      setResult({ ok: true, text: `Imported ${plural(res.created, 'unit')}.${skipped}` })
      setFile(null)
      router.refresh()
    } catch (err) {
      const errors = err instanceof ApiError ? ((err.body.errors as string[] | undefined) ?? []) : []
      const total = err instanceof ApiError ? Number(err.body.totalErrors ?? 0) : 0
      const more = total > errors.length ? [`…and ${total - errors.length} more`] : []
      setResult({ ok: false, text: 'Nothing was imported. Fix these and upload again:', details: [...(errors.length ? errors : [errorMessage(err)]), ...more] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card mb-6">
      <div className="card-header">
        <div>
          <span className="card-title">Or import from Excel</span>
          <p className="text-sm text-muted mt-1 mb-0">For irregular buildings, or to bring in an existing unit list. One row per unit.</p>
        </div>
        <ButtonLink href={`/api/projects/${projectId}/structure/template`} size="sm" download>⬇ Download template</ButtonLink>
      </div>
      <div className="flex gap-3 items-center wrap">
        <Input type="file" className="max-w-md" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Filled Excel template" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null) }} />
        <Button variant="primary" disabled={!file} loading={busy} onClick={upload}>{busy ? 'Importing…' : 'Import'}</Button>
      </div>
      {result && (
        <Alert variant={result.ok ? 'success' : 'danger'} className="mt-3">
          {result.text}
          {result.details && <ul className="mt-2 mb-0 pl-5">{result.details.map((d) => <li key={d}>{d}</li>)}</ul>}
        </Alert>
      )}
    </div>
  )
}
