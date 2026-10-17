'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useConfirm, useToast } from '@/components/ui'
import { errorMessage, fetchJson } from '@/lib/client/api'

export default function DeleteSaleButton({ saleId }: { saleId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete this sale?',
      message: 'This permanently deletes the sale and all of its data: buyers, payments and documents. It cannot be undone.',
      confirmLabel: 'Delete sale',
      danger: true,
    })
    if (!ok) return
    setLoading(true)
    try {
      await fetchJson(`/api/sales/${saleId}`, { method: 'DELETE' })
      toast.success('Sale deleted')
      router.push('/sales')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
      setLoading(false)
    }
  }

  return <Button variant="danger" loading={loading} onClick={handleDelete}>🗑 Delete Sale</Button>
}
