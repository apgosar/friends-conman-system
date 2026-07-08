'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/template-engine'

export default function KycDocumentRow({ doc }: { doc: any }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleVerify = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/kyc/${doc.id}/verify`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to verify')
      router.refresh()
    } catch (err) {
      alert(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <tr>
      <td style={{ fontWeight: 500 }}>{doc.docType.replace(/_/g, ' ')}</td>
      <td>
        <span className={`badge ${doc.status === 'VERIFIED' ? 'badge-success' : doc.status === 'REJECTED' ? 'badge-danger' : 'badge-warning'}`}>
          {doc.status}
        </span>
      </td>
      <td style={{ color: 'var(--text-muted)' }}>{formatDate(doc.createdAt)}</td>
      <td>
        <div className="flex gap-2">
          <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            View
          </a>
          {doc.status !== 'VERIFIED' && (
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={handleVerify}
              disabled={loading}
            >
              {loading ? '...' : 'Verify'}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
