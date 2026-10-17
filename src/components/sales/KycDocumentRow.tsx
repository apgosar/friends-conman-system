'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/format'
import { Button, StatusBadge, Td, useToast } from '@/components/ui'
import { errorMessage, fetchJson } from '@/lib/client/api'

export default function KycDocumentRow({ doc }: { doc: any }) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  const handleVerify = async () => {
    setLoading(true)
    try {
      await fetchJson(`/api/kyc/${doc.id}/verify`, { method: 'POST' })
      toast.success('Document verified')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <tr>
      <Td label="Document" className="font-medium">{doc.docType.replace(/_/g, ' ')}</Td>
      <Td label="Status"><StatusBadge kind="kyc" status={doc.status} /></Td>
      <Td label="Uploaded" className="text-muted">{formatDate(doc.createdAt)}</Td>
      <Td label="">
        <div className="flex gap-2">
          <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">View</a>
          {doc.status !== 'VERIFIED' && <Button size="sm" loading={loading} onClick={handleVerify}>Verify</Button>}
        </div>
      </Td>
    </tr>
  )
}
