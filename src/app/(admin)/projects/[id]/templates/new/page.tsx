'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import { TEMPLATE_TYPES, TEMPLATE_LIMITS, LETTERHEAD_TYPES, formatBytes } from '@/lib/template-constants'
import TemplateTagReference from '@/components/projects/TemplateTagReference'
import { Alert, Button, ButtonLink, Card, CardHeader, SelectField, TextField, TextareaField } from '@/components/ui'
import { errorMessage, fetchJson } from '@/lib/client/api'
import { formatNumber } from '@/lib/format'
import { highlightField } from '@/lib/client/forms'

export default function NewTemplatePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params)
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [type, setType] = useState('SALE_AGREEMENT')
  const [format, setFormat] = useState('DOCX') // DOCX or HTML
  
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[] | null>(null) // set after a successful save that has warnings
  const isLetterheadType = LETTERHEAD_TYPES.includes(type)

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

    if (format === 'DOCX') {
      const problem = checkFile(formData.get('file') as File)
      if (problem) return setError(problem)
      formData.delete('templateHtml')
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
                <SelectField label="Document type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
                  {TEMPLATE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </SelectField>

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
                    onChange={(e) => setError(checkFile(e.target.files?.[0]))}
                    hint={`Word .docx only, up to ${formatBytes(TEMPLATE_LIMITS.docxMaxBytes)}. Include tags like {{buyer1Name}} inside the document.`}
                  />
                ) : (
                  <TextareaField label="HTML content" name="templateHtml" rows={10} required className="mono" placeholder="<h1>Demand Letter for {{buyer1Name}}</h1>..." />
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
