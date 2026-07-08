'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteSaleButton({ saleId }: { saleId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    if (!confirm('⚠️ Permanently delete this sale and ALL its data (buyers, payments, documents)? This CANNOT be undone.')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/sales/${saleId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete sale')
      router.push('/sales')
      router.refresh()
    } catch (err: any) {
      alert(err.message)
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      className="btn btn-secondary"
      style={{ color: 'var(--color-danger, #ef4444)', borderColor: 'var(--color-danger, #ef4444)' }}
      disabled={loading}
      onClick={handleDelete}
    >
      {loading ? 'Deleting...' : '🗑 Delete Sale'}
    </button>
  )
}
