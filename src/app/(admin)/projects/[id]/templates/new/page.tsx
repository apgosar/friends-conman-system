'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'

export default function NewTemplatePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params)
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  
  const [type, setType] = useState('SALE_AGREEMENT')
  const [format, setFormat] = useState('DOCX') // DOCX or HTML
  
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const formData = new FormData(e.currentTarget)
      let fileUrl = null
      let templateHtml = null

      if (format === 'DOCX') {
        const file = formData.get('file') as File
        if (!file || file.size === 0) throw new Error('Please select a DOCX file')
        
        // Upload file first
        const uploadData = new FormData()
        uploadData.append('file', file)
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: uploadData
        })
        const uploadJson = await uploadRes.json()
        if (!uploadRes.ok) throw new Error(uploadJson.error || 'Upload failed')
        fileUrl = uploadJson.url
      } else {
        templateHtml = formData.get('templateHtml') as string
        if (!templateHtml) throw new Error('Please enter HTML content')
      }

      // Save template record
      const res = await fetch(`/api/projects/${params.id}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          type,
          fileUrl,
          templateHtml
        })
      })
      
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save template')
      
      router.push(`/projects/${params.id}/templates`)
      router.refresh()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <TopNav title="New Template" subtitle="Upload a new document template" />
      <div className="admin-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 40, paddingBottom: 40 }}>
        <div style={{ background: 'var(--bg-card)', width: '100%', maxWidth: 600, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
          
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>Template Details</h3>
          </div>
          
          <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="form-group">
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Template Name</label>
              <input type="text" name="name" required placeholder="e.g. Standard Sale Agreement v2" className="input" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
            </div>

            <div className="form-group">
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Document Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} name="type" className="input" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', boxSizing: 'border-box' }}>
                <option value="SALE_AGREEMENT">Sale Agreement</option>
                <option value="PAAA">PAAA (Redevelopment)</option>
                <option value="DEMAND_LETTER">Demand Letter</option>
                <option value="RECEIPT">Receipt</option>
                <option value="POSSESSION_LETTER">Possession Letter</option>
              </select>
            </div>

            <div className="form-group">
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Format</label>
              <select value={format} onChange={(e) => setFormat(e.target.value)} className="input" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', boxSizing: 'border-box' }}>
                <option value="DOCX">Word Document (.docx)</option>
                <option value="HTML">HTML (for PDFs)</option>
              </select>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                Use DOCX for agreements so they can be edited later. Use HTML for static PDFs like receipts.
              </p>
            </div>

            {format === 'DOCX' ? (
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Upload .docx File</label>
                <input type="file" name="file" accept=".docx" required className="input" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                  Include tags like {'{{buyer1Name}}'} inside the document.
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

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button type="button" onClick={() => router.back()} className="btn" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px' }}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ borderRadius: '8px' }} disabled={loading}>
                {loading ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
