'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/template-engine'

export default function MilestoneRow({ m }: { m: any }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [certificateFile, setCertificateFile] = useState<File | null>(null)

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!certificateFile) return alert('Architect Completion Certificate is required')
    
    setLoading(true)
    try {
      // 1. Upload the certificate
      const formData = new FormData()
      formData.append('file', certificateFile)
      
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Failed to upload certificate')
      
      const certificateUrl = uploadData.url

      // 2. Complete the milestone
      const res = await fetch(`/api/milestones/${m.id}/complete`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ architectCertificateUrl: certificateUrl })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to complete')
      }
      setShowModal(false)
      router.refresh()
    } catch (err: any) {
      alert(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{m.sequence}</td>
      <td style={{ fontWeight: 500 }}>{m.name}</td>
      <td>
        <span className={`badge ${m.status === 'COMPLETED' ? 'badge-success' : m.status === 'IN_PROGRESS' ? 'badge-warning' : 'badge-muted'}`}>
          {m.status.replace(/_/g, ' ')}
        </span>
      </td>
      <td style={{ color: 'var(--text-muted)' }}>{m.plannedDate ? formatDate(m.plannedDate) : '—'}</td>
      <td style={{ color: 'var(--text-muted)' }}>{m.actualDate ? formatDate(m.actualDate) : '—'}</td>
      <td>
        <div className="flex gap-2">
          {m.architectCertificateUrl ? (
            <a href={m.architectCertificateUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
              View Cert
            </a>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>None</span>
          )}
          
          {m.status !== 'COMPLETED' && (
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => setShowModal(true)}
            >
              Mark Complete
            </button>
          )}
        </div>
      </td>

      {showModal && (
        <td colSpan={0}>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setShowModal(false)} />
            <div style={{ position: 'relative', background: 'var(--bg-card)', width: '100%', maxWidth: 500, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Complete Milestone</h3>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{m.name}</p>
                </div>
                <button onClick={() => setShowModal(false)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', transition: 'background 0.2s' }}>×</button>
              </div>
              
              <form onSubmit={handleComplete} style={{ padding: 24 }}>
                <div className="form-control" style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Architect Completion Certificate (PDF/Image) *
                  </label>
                  <input 
                    type="file" 
                    required 
                    accept=".pdf,image/*"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                    onChange={e => setCertificateFile(e.target.files?.[0] || null)}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8, display: 'block' }}>
                    Upload the signed completion certificate from the architect.
                  </span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 32 }}>
                  <button type="button" className="btn" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px' }} onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ borderRadius: '8px' }} disabled={loading || !certificateFile}>
                    {loading ? 'Uploading...' : 'Submit & Complete'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </td>
      )}
    </tr>
  )
}
