'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/template-engine'
import { useSession } from 'next-auth/react'

export default function MilestoneRow({ m }: { m: any }) {
  const router = useRouter()
  const { data: session } = useSession()
  const isSuperAdmin = session?.user?.role === 'SUPER_ADMIN'

  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [certificateFile, setCertificateFile] = useState<File | null>(null)

  const handleDelete = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/milestones/${m.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete milestone')
      }
      setShowDeleteModal(false)
      router.refresh()
    } catch (err: any) {
      alert(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

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
      <td className="font-semibold">{m.sequence}</td>
      <td className="font-medium">{m.name}</td>
      <td>
        <span className={`badge ${m.status === 'COMPLETED' ? 'badge-success' : m.status === 'IN_PROGRESS' ? 'badge-warning' : 'badge-muted'}`}>
          {m.status.replace(/_/g, ' ')}
        </span>
      </td>
      <td className="text-muted">{m.plannedDate ? formatDate(m.plannedDate) : '—'}</td>
      <td className="text-muted">{m.actualDate ? formatDate(m.actualDate) : '—'}</td>
      <td>
        <div className="flex gap-2">
          {m.architectCertificateUrl ? (
            <a href={m.architectCertificateUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
              View Cert
            </a>
          ) : (
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>None</span>
          )}
          
          {m.status !== 'COMPLETED' && (
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => setShowModal(true)}
            >
              Mark Complete
            </button>
          )}

          {isSuperAdmin && (
            <button
              className="btn btn-sm"
              style={{ background: 'var(--bg-error)', color: 'var(--text-on-error)', border: 'none' }}
              onClick={() => setShowDeleteModal(true)}
            >
              🗑️ Delete
            </button>
          )}
        </div>
      </td>

      {showModal && (
        <td colSpan={0}>
          <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setShowModal(false)} />
            <div className="relative w-full overflow-hidden" style={{ background: 'var(--bg-card)', maxWidth: 500, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)' }}>
              <div className="flex justify-between items-center" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
                <div>
                  <h3 className="text-xl font-semibold m-0 text-primary">Complete Milestone</h3>
                  <p className="text-sm text-muted" style={{ margin: '4px 0 0' }}>{m.name}</p>
                </div>
                <button onClick={() => setShowModal(false)} className="flex items-center justify-center text-muted cursor-pointer" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, fontSize: '1.2rem', transition: 'background 0.2s' }}>×</button>
              </div>
              
              <form onSubmit={handleComplete} className="p-6">
                <div className="form-control mb-6">
                  <label className="block text-sm font-medium text-secondary" style={{ marginBottom: 6 }}>
                    Architect Completion Certificate (PDF/Image) *
                  </label>
                  <input 
                    type="file" 
                    required 
                    accept=".pdf,image/*"
                    className="w-full text-primary" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', boxSizing: 'border-box' }}
                    onChange={e => setCertificateFile(e.target.files?.[0] || null)}
                  />
                  <span className="text-xs text-muted mt-2 block">
                    Upload the signed completion certificate from the architect.
                  </span>
                </div>
                
                <div className="flex justify-end gap-3 mt-8">
                  <button type="button" className="btn text-primary" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px' }} onClick={() => setShowModal(false)}>
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

      {showDeleteModal && (
        <td colSpan={0}>
          <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setShowDeleteModal(false)} />
            <div className="relative w-full overflow-hidden" style={{ background: 'var(--bg-card)', maxWidth: 500, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)' }}>
              <div className="flex justify-between items-center" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-error)', color: 'var(--text-on-error)' }}>
                <div>
                  <h3 className="text-xl font-semibold m-0" style={{ color: 'white' }}>Delete Milestone</h3>
                  <p className="text-sm" style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.8)' }}>{m.name}</p>
                </div>
                <button onClick={() => setShowDeleteModal(false)} className="cursor-pointer" style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.2rem' }}>×</button>
              </div>
              
              <div className="p-6">
                <p className="text-primary mb-4">
                  Are you sure you want to delete this milestone?
                </p>
                <p className="text-muted mb-6 p-3" style={{ fontSize: '0.9rem', background: 'var(--bg-surface)', borderRadius: 8, borderLeft: '4px solid var(--color-warning)' }}>
                  This will also delete <strong>all pending payment schedules (Demand Letters)</strong> generated for this milestone across all sales. If payments have already been made against these schedules, deletion will be blocked to preserve financial data integrity.
                </p>
                
                <div className="flex justify-end gap-3">
                  <button type="button" className="btn text-primary" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px' }} onClick={() => setShowDeleteModal(false)}>
                    Cancel
                  </button>
                  <button type="button" onClick={handleDelete} className="btn" style={{ background: 'var(--bg-error)', color: 'var(--text-on-error)', borderRadius: '8px', border: 'none' }} disabled={loading}>
                    {loading ? 'Deleting...' : 'Yes, Delete Milestone'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </td>
      )}
    </tr>
  )
}
