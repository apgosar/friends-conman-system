'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Card, CardHeader, CheckboxField, Input, SelectField, TextField } from '@/components/ui'
import { ApiError, errorMessage, fetchJson } from '@/lib/client/api'
import { plural } from '@/lib/errors'
import { titleKey } from '@/lib/parking-import'

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
  // What each table title stands for, e.g. “P -1 1st Floor Parking” is Floor 1st and Level P1: written out per title and per detail
  const [titleValues, setTitleValues] = useState<Record<string, Record<string, string>>>({})
  const [replace, setReplace] = useState(false)
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
      setTitleValues({})
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
      body.append('mapping', JSON.stringify({ columns, title: 'ignore', titleValues, replace }))
      const res = await fetchJson(`/api/projects/${projectId}/parking/import`, { method: 'POST', body })
      const removed = res.removed ? ` ${plural(res.removed, 'space')} not sold in the app ${res.removed === 1 ? 'was' : 'were'} replaced.` : ''
      const skipped = res.skipped ? ` ${plural(res.skipped, 'space')} already in the list ${res.skipped === 1 ? 'was' : 'were'} skipped.` : ''
      setResult({ ok: true, text: `Imported ${plural(res.created, 'parking space')}.${skipped}${removed}` })
      setFile(null); setPreview(null)
      router.refresh()
    } catch (err) {
      failure(err, 'Nothing was imported. Fix these and try again:')
    } finally {
      setBusy(false)
    }
  }

  const titles = [...new Set((preview?.blocks ?? []).flatMap((b) => (b.title ? [b.title] : [])))]
  const missing = titles.some((t) => !Object.values(titleValues[titleKey(t)] ?? {}).some((v) => v.trim()))

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
          </div>
          {titles.length > 0 && (
            <div className="mb-4">
              <h4 className="mb-1">What each table title means</h4>
              <p className="form-hint mb-3">Say which value of each parking detail a table title stands for, for example “P -1 1st Floor Parking” is Floor 1st and Level P1. Every space in that table gets these values.</p>
              {titles.map((t) => (
                <div key={t} className="panel mb-3">
                  <div className="font-semibold mb-2">{t}</div>
                  <div className="grid grid-3 gap-3">
                    {preview.fields.map((f) => (
                      <TextField key={f.key} label={f.name} value={titleValues[titleKey(t)]?.[f.key] ?? ''} maxLength={100} onChange={(e) => setTitleValues((m) => ({ ...m, [titleKey(t)]: { ...m[titleKey(t)], [f.key]: e.target.value } }))} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <CheckboxField label="Replace the spaces already in the list" checked={replace} onChange={(e) => setReplace(e.target.checked)} hint="Removes every space no sale holds and brings in the ones from this file. Use it to redo an import. Sold spaces stay" />
          {missing && <Alert variant="warning" className="mb-3">Fill in at least one detail for every table title above</Alert>}
          <Button variant="primary" loading={busy} disabled={missing} onClick={run}>Import</Button>
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
