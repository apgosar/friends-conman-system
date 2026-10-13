'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import Link from 'next/link'
import { TEMPLATE_TYPES, TEMPLATE_LIMITS, LETTERHEAD_TYPES, formatBytes } from '@/lib/template-constants'
import TemplateTagReference from '@/components/projects/TemplateTagReference'

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
      if (!html.trim()) return setError('HTML content is required')
      if (html.length > TEMPLATE_LIMITS.htmlMaxChars) return setError(`HTML is too long. Maximum is ${TEMPLATE_LIMITS.htmlMaxChars.toLocaleString('en-IN')} characters`)
      formData.delete('file')
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${params.id}/templates`, { method: 'POST', body: formData })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to save template')
      if (Array.isArray(json.warnings) && json.warnings.length > 0) {
        setWarnings(json.warnings) // saved, but show what looks wrong before leaving
      } else {
        router.push(`/projects/${params.id}/templates`)
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <TopNav title="New Template" subtitle="Upload a new document template" />
      <div className="admin-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 40, paddingBottom: 40 }}>
        <div style={{ width: '100%', maxWidth: 600 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <Link href={`/projects/${params.id}/templates`} className="btn btn-secondary">← Back to Templates</Link>
        </div>
        <div style={{ background: 'var(--bg-card)', width: '100%', maxWidth: 600, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
          
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>Template Details</h3>
          </div>
          
          {warnings ? (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="alert alert-success" style={{ margin: 0 }}>Template saved and set as the active version.</div>
              <div className="alert alert-warning" style={{ margin: 0 }}>
                <strong>Please double-check:</strong>
                <ul style={{ margin: '6px 0 0 18px' }}>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </div>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                If a tag is wrong, fix the file and upload it again; the new upload becomes the next version and the old one stays available.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-primary" onClick={() => { router.push(`/projects/${params.id}/templates`); router.refresh() }}>Go to Templates</button>
              </div>
            </div>
          ) : (
          <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="form-group">
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Template Name</label>
              <input type="text" name="name" required placeholder="e.g. Standard Sale Agreement v2" className="input" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
            </div>

            <div className="form-group">
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Document Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} name="type" className="input" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', boxSizing: 'border-box' }}>
                {TEMPLATE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Format</label>
              <select value={format} onChange={(e) => setFormat(e.target.value)} className="input" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', boxSizing: 'border-box' }}>
                <option value="DOCX">Word Document (.docx)</option>
                <option value="HTML">HTML (for PDFs)</option>
              </select>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                {isLetterheadType
                  ? 'Use DOCX so the company letterhead is kept. It is converted to PDF automatically when sent by email or WhatsApp.'
                  : 'Use DOCX for agreements so they can be edited later. HTML is for simple, unbranded PDFs.'}
              </p>
            </div>

            {format === 'DOCX' ? (
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Upload .docx File</label>
                <input type="file" name="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required onChange={(e) => setError(checkFile(e.target.files?.[0]))} className="input" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                  Word .docx only, up to {formatBytes(TEMPLATE_LIMITS.docxMaxBytes)}. Include tags like {'{{buyer1Name}}'} inside the document.
                </p>
              </div>
            ) : (
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>HTML Content</label>
                <textarea 
                  name="templateHtml" 
                  rows={10} 
                  required 
                  style={{ fontFamily: 'monospace', width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', boxSizing: 'border-box', resize: 'vertical' }}
                  placeholder="<h1>Demand Letter for {{buyer1Name}}</h1>..."
                />
              </div>
            )}

            <TemplateTagReference projectId={params.id} type={type} />

            {error && <div role="alert" className="alert alert-danger" style={{ margin: 0 }}>{error}</div>}

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button type="button" onClick={() => router.back()} className="btn" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px' }}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ borderRadius: '8px' }} disabled={loading}>
                {loading ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </form>
          )}
        </div>
        </div>
      </div>
    </>
  )
}
