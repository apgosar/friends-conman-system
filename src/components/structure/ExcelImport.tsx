'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, inputStyle } from './ui'
import { Button } from '@/components/ui'

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
      const res = await api(`/api/projects/${projectId}/structure/import`, { method: 'POST', body })
      const skipped = res.skipped.length ? ` ${res.skipped.length} unit number(s) already existed and were skipped.` : ''
      setResult({ ok: true, text: `Imported ${res.created} unit(s).${skipped}` })
      setFile(null)
      router.refresh()
    } catch (err: any) {
      const more = err.totalErrors && err.totalErrors > (err.errors?.length ?? 0) ? [`…and ${err.totalErrors - err.errors.length} more`] : []
      setResult({ ok: false, text: 'Nothing was imported. Fix these and upload again:', details: [...(err.errors ?? [err.message]), ...more] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card mb-6">
      <div className="card-header">
        <div>
          <span className="card-title">Or import from Excel</span>
          <p className="text-sm text-muted" style={{ margin: '4px 0 0' }}>For irregular buildings, or to bring in an existing unit list. One row per unit.</p>
        </div>
        <a href={`/api/projects/${projectId}/structure/template`} className="btn btn-secondary btn-sm">⬇ Download template</a>
      </div>
      <div className="flex gap-3 items-center wrap">
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null) }} style={{ ...inputStyle, maxWidth: 380 }} />
        <Button variant="primary" disabled={!file || busy} onClick={upload}>{busy ? 'Importing…' : 'Import'}</Button>
      </div>
      {result && (
        <div role={result.ok ? 'status' : 'alert'} className="mt-3 text-base" style={{ color: result.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {result.text}
          {result.details && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{result.details.map((d) => <li key={d}>{d}</li>)}</ul>}
        </div>
      )}
    </div>
  )
}
