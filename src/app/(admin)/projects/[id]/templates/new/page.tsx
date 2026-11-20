'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import { TEMPLATE_TYPES, TEMPLATE_LIMITS, LETTERHEAD_TYPES, formatBytes, isMultiTemplateType } from '@/lib/template-constants'
import TemplateTagReference from '@/components/projects/TemplateTagReference'
import { Alert, Button, ButtonLink, Card, CardHeader, CheckboxField, SelectField, TextField, TextareaField } from '@/components/ui'
import { errorMessage, fetchJson } from '@/lib/client/api'
import { formatNumber } from '@/lib/format'
import { highlightField } from '@/lib/client/forms'
import type { TagSuggestion } from '@/lib/template-tagging'

export default function NewTemplatePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params)
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [type, setType] = useState('SALE_AGREEMENT')
  const [format, setFormat] = useState('DOCX') // DOCX or HTML
  
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[] | null>(null) // set after a successful save that has warnings
  const isLetterheadType = LETTERHEAD_TYPES.includes(type)
  const named = isMultiTemplateType(type) // possession documents: each has its own name
  const [knownNames, setKnownNames] = useState<string[]>([]) // names already used, so a new upload of one becomes its next version

  // Gemini's suggestions of where the {{tags}} go in a plain letter: the person ticks the ones to use, and they are put in when the template is saved
  const [pickedFile, setPickedFile] = useState<File | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestions, setSuggestions] = useState<TagSuggestion[] | null>(null)
  const [chosen, setChosen] = useState<Set<number>>(new Set())

  const suggestTags = async (form: HTMLFormElement | null) => {
    if (!pickedFile || !form) return
    setError('')
    setSuggesting(true)
    try {
      const body = new FormData()
      body.append('file', pickedFile)
      body.append('type', type)
      const name = new FormData(form).get('name')
      if (typeof name === 'string' && name) body.append('name', name)
      const json = await fetchJson(`/api/projects/${params.id}/templates/suggest-tags`, { method: 'POST', body })
      const list = json.data as TagSuggestion[]
      setSuggestions(list)
      setChosen(new Set(list.map((_, i) => i))) // all ticked: the person unticks what is wrong
    } catch (err) {
      setSuggestions(null)
      setError(errorMessage(err))
    } finally {
      setSuggesting(false)
    }
  }

  useEffect(() => {
    if (!named) return
    fetchJson(`/api/projects/${params.id}/templates`)
      .then((json) => setKnownNames([...new Set<string>((json.data as { type: string; name: string }[]).filter((t) => t.type === type).map((t) => t.name))].sort()))
      .catch(() => setKnownNames([])) // only suggestions
  }, [named, type, params.id])

  // The server repeats these checks; doing them here just gives instant feedback
  const checkFile = (file: File | undefined): string => {
    if (!file || file.size === 0) return 'Please select a .docx file'
    if (!file.name.toLowerCase().endsWith('.docx')) return 'Only Word .docx files are accepted (not .doc, .pdf or other formats)'
    if (file.size > TEMPLATE_LIMITS.docxMaxBytes) return `File is too large (${formatBytes(file.size)}). Maximum allowed is ${formatBytes(TEMPLATE_LIMITS.docxMaxBytes)}`
    return ''
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    const formData = new FormData(e.currentTarget)
    if (named && !String(formData.get('name') ?? '').trim()) { highlightField('name'); return setError('Enter the document name, for example Handover letter') }

    if (format === 'DOCX') {
      const problem = checkFile(formData.get('file') as File)
      if (problem) return setError(problem)
      formData.delete('templateHtml')
      if (suggestions && chosen.size > 0) {
        formData.append('tags', JSON.stringify(suggestions.filter((_, i) => chosen.has(i)).map(({ text, tag }) => ({ text, tag }))))
      }
    } else {
      const html = String(formData.get('templateHtml') ?? '')
      if (!html.trim()) { highlightField('templateHtml'); return setError('HTML content is required') }
      if (html.length > TEMPLATE_LIMITS.htmlMaxChars) return setError(`HTML is too long. Maximum is ${formatNumber(TEMPLATE_LIMITS.htmlMaxChars)} characters`)
      formData.delete('file')
    }

    setLoading(true)
    try {
      const json = await fetchJson(`/api/projects/${params.id}/templates`, { method: 'POST', body: formData })
      if (Array.isArray(json.warnings) && json.warnings.length > 0) {
        setWarnings(json.warnings) // saved, but show what looks wrong before leaving
      } else {
        router.push(`/projects/${params.id}/templates`)
        router.refresh()
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <TopNav title="New Template" subtitle="Upload a new document template" />
      <div className="admin-content">
        <div className="max-w-md mx-auto">
          <div className="flex justify-end mb-4">
            <ButtonLink href={`/projects/${params.id}/templates`}>← Back to Templates</ButtonLink>
          </div>
          <Card>
            <CardHeader title="Template details" />

            {warnings ? (
              <div className="flex dir-col gap-4">
                <Alert variant="success">Template saved and set as the active version.</Alert>
                <Alert variant="warning" title="Please double-check">
                  <ul className="mt-2 mb-0 pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                </Alert>
                <p className="m-0 text-sm text-muted">
                  If a tag is wrong, fix the file and upload it again. The new upload becomes the next version and the old one stays available.
                </p>
                <div className="flex justify-end">
                  <Button variant="primary" onClick={() => { router.push(`/projects/${params.id}/templates`); router.refresh() }}>Go to Templates</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex dir-col gap-5">
                <SelectField label="Document type" name="type" value={type} onChange={(e) => { setType(e.target.value); setSuggestions(null) }}>
                  {TEMPLATE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </SelectField>

                {named && (
                  <>
                    <TextField
                      label="Document name"
                      name="name"
                      required
                      maxLength={TEMPLATE_LIMITS.nameMax}
                      list="possession-names"
                      placeholder="Handover letter"
                      hint="All active possession documents are made together for a fully paid sale. Use an existing name to upload a new version of it"
                    />
                    <datalist id="possession-names">{knownNames.map((n) => <option key={n} value={n} />)}</datalist>
                  </>
                )}

                <SelectField
                  label="Format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  hint={isLetterheadType
                    ? 'Use DOCX so the company letterhead is kept. It is converted to PDF automatically when sent by email or WhatsApp.'
                    : 'Use DOCX for agreements so they can be edited later. HTML is for simple, unbranded PDFs.'}
                >
                  <option value="DOCX">Word Document (.docx)</option>
                  <option value="HTML">HTML (for PDFs)</option>
                </SelectField>

                {format === 'DOCX' ? (
                  <TextField
                    label="Upload .docx file"
                    type="file"
                    name="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    required
                    onChange={(e) => { setError(checkFile(e.target.files?.[0])); setPickedFile(e.target.files?.[0] ?? null); setSuggestions(null) }}
                    hint={`Word .docx only, up to ${formatBytes(TEMPLATE_LIMITS.docxMaxBytes)}. Include tags like {{buyer1Name}} inside the document, or let Gemini suggest them below.`}
                  />
                ) : (
                  <TextareaField label="HTML content" name="templateHtml" rows={10} required className="mono" placeholder="<h1>Demand Letter for {{buyer1Name}}</h1>..." />
                )}

                {format === 'DOCX' && (
                  <div className="flex dir-col gap-3 card-flat p-3">
                    <div className="flex gap-3 items-center wrap">
                      <Button onClick={(e) => suggestTags(e.currentTarget.form)} loading={suggesting} disabled={!pickedFile}>✨ Suggest tags with Gemini</Button>
                      <span className="text-sm text-muted">Upload a plain letter with a real sale typed into it. Gemini proposes which text becomes a tag; you choose which to use.</span>
                    </div>
                    {suggestions && suggestions.length === 0 && <Alert variant="info">No tags were suggested for this letter. Add the tags by hand, or try a letter with a real sale typed into it</Alert>}
                    {suggestions && suggestions.length > 0 && (
                      <div className="flex dir-col gap-2">
                        <p className="m-0 text-sm text-muted">Tick the tags to put in. They are added when you save the template; the file you uploaded is not changed.</p>
                        {suggestions.map((s, i) => (
                          <CheckboxField
                            key={`${s.text}-${s.tag}`}
                            checked={chosen.has(i)}
                            onChange={(e) => setChosen((prev) => { const next = new Set(prev); if (e.target.checked) next.add(i); else next.delete(i); return next })}
                            label={<><strong>{s.text}</strong> becomes <code>{`{{${s.tag}}}`}</code></>}
                            hint={`${s.desc}${s.occurrences > 1 ? ` · ${s.occurrences} places` : ''}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <TemplateTagReference projectId={params.id} type={type} />

                {error && <Alert variant="danger">{error}</Alert>}

                <div className="flex justify-end gap-3">
                  <Button onClick={() => router.back()}>Cancel</Button>
                  <Button type="submit" variant="primary" loading={loading}>Save Template</Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
