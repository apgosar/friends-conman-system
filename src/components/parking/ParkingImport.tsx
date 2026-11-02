'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Card, CardHeader, Input, SelectField } from '@/components/ui'
import { ApiError, errorMessage, fetchJson } from '@/lib/client/api'
import { plural } from '@/lib/errors'

interface Preview {
  hasTitles: boolean
  blocks: { title: string | null; rows: number; headers: string[]; sample: string[][] }[]
  columns: { name: string; suggested: string }[]
  fields: { key: string; name: string }[]
}

/**
 * Brings a parking sheet in from Excel. Sheets differ from project to project, so the sheet is read first and the person says what each
 * column holds; nothing is saved until they confirm. Spaces already in the project are skipped, so running it again is safe.
 */
export default function ParkingImport({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [columns, setColumns] = useState<Record<string, string>>({})
  const [title, setTitle] = useState('ignore')
  const [result, setResult] = useState<{ ok: boolean; text: string; details?: string[] } | null>(null)

  const failure = (err: unknown, lead: string) => {
    const errors = err instanceof ApiError ? ((err.body.errors as string[] | undefined) ?? []) : []
    const total = err instanceof ApiError ? Number(err.body.totalErrors ?? 0) : 0
    const more = total > errors.length ? [`…and ${total - errors.length} more`] : []
    setResult({ ok: false, text: lead, details: [...(errors.length ? errors : [errorMessage(err)]), ...more] })
  }

  const read = async () => {
    if (!file) return
    setBusy(true); setResult(null); setPreview(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetchJson(`/api/projects/${projectId}/parking/import`, { method: 'POST', body })
      const p = res.preview as Preview
      setPreview(p)
      setColumns(Object.fromEntries(p.columns.map((c) => [c.name.toLowerCase(), c.suggested])))
      // A title row such as "Ground Floor Parking" most likely belongs to the first detail (the level), unless a column already fills it
      const taken = new Set(p.columns.map((c) => c.suggested))
      const free = p.fields.find((f) => !taken.has(`field:${f.key}`))
      setTitle(p.hasTitles && free ? `field:${free.key}` : 'ignore')
    } catch (err) {
      failure(err, 'The file could not be read:')
    } finally {
      setBusy(false)
    }
  }

  const run = async () => {
    if (!file || !preview) return
    setBusy(true); setResult(null)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('mapping', JSON.stringify({ columns, title }))
      const res = await fetchJson(`/api/projects/${projectId}/parking/import`, { method: 'POST', body })
      const skipped = res.skipped ? ` ${plural(res.skipped, 'space')} already in the list ${res.skipped === 1 ? 'was' : 'were'} skipped.` : ''
      setResult({ ok: true, text: `Imported ${plural(res.created, 'parking space')}.${skipped}` })
      setFile(null); setPreview(null)
      router.refresh()
    } catch (err) {
      failure(err, 'Nothing was imported. Fix these and try again:')
    } finally {
      setBusy(false)
    }
  }

  const targets = preview && (
    <>
      <option value="ignore">Not needed</option>
      {preview.fields.map((f) => <option key={f.key} value={`field:${f.key}`}>{f.name}</option>)}
      <option value="type">Type of parking</option>
      <option value="allottedTo">Allotted to</option>
      <option value="registered">Registered (Yes / No)</option>
    </>
  )

  return (
    <Card className="mb-6">
      <CardHeader title="Import from Excel" />
      <p className="form-hint mb-4">
        Upload your parking sheet (.xlsx), then say what each column holds. The sheet can be one table, or several tables one under another, each with a title row such as “Ground Floor Parking”.
        Spaces already in the list are skipped.
      </p>
      <div className="flex gap-3 items-center wrap">
        <Input type="file" className="max-w-md" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Parking sheet" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setResult(null) }} />
        <Button variant={preview ? 'secondary' : 'primary'} disabled={!file} loading={busy && !preview} onClick={read}>{preview ? 'Read again' : 'Read the file'}</Button>
      </div>

      {preview && (
        <div className="mt-4">
          <p className="mb-3">
            Found {plural(preview.blocks.reduce((n, b) => n + b.rows, 0), 'row')} in {plural(preview.blocks.length, 'table')}
            {preview.hasTitles ? `: ${preview.blocks.map((b) => b.title ?? 'untitled').join(', ')}` : ''}.
          </p>
          <div className="grid grid-2 gap-3 mb-3">
            {preview.columns.map((c) => (
              <SelectField key={c.name} label={`Column “${c.name}”`} value={columns[c.name.toLowerCase()] ?? 'ignore'} onChange={(e) => setColumns((m) => ({ ...m, [c.name.toLowerCase()]: e.target.value }))}>
                {targets}
              </SelectField>
            ))}
            {preview.hasTitles && (
              <SelectField label="Table title (e.g. “Ground Floor Parking”)" value={title} onChange={(e) => setTitle(e.target.value)} hint="Which detail the title of each table fills in">
                <option value="ignore">Not needed</option>
                {preview.fields.map((f) => <option key={f.key} value={`field:${f.key}`}>{f.name}</option>)}
              </SelectField>
            )}
          </div>
          <Button variant="primary" loading={busy} onClick={run}>Import</Button>
        </div>
      )}

      {result && (
        <Alert variant={result.ok ? 'success' : 'danger'} className="mt-3">
          {result.text}
          {result.details && <ul className="mt-2 mb-0 pl-5">{result.details.map((d) => <li key={d}>{d}</li>)}</ul>}
        </Alert>
      )}
    </Card>
  )
}
