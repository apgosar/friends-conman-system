'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import type { DuplicateContact } from '@/lib/buyers'

const what = (d: DuplicateContact) => (d.mobile && d.email ? 'mobile number and email' : d.mobile ? 'mobile number' : 'email')
const sentTwice = (d: DuplicateContact) => (d.mobile && d.email ? 'by WhatsApp and email' : d.mobile ? 'by WhatsApp' : 'by email')

/**
 * Warns that a co-buyer shares the contact details of an earlier buyer (often a husband's details typed for his wife too), so
 * every demand letter and receipt goes out twice; staff who may edit the sale can turn the co-buyer's communication off here.
 */
export default function DuplicateContactsAlert({ duplicates, canEdit }: { duplicates: DuplicateContact[]; canEdit: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const turnOff = async (d: DuplicateContact) => {
    setBusy(d.buyerId)
    try {
      await fetchJson(`/api/buyers/${d.buyerId}`, jsonRequest('PATCH', { receiveComms: false }))
      toast.success(`Communication turned off for ${d.name}`)
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (duplicates.length === 0) return null
  return (
    <Alert variant="warning" className="mb-4" title="Messages will be sent twice">
      {duplicates.map((d) => (
        <div key={d.buyerId} className="flex justify-between items-center gap-3 wrap mt-2">
          <span>
            <strong>{d.name}</strong> has the same {what(d)} as <strong>{d.sameAs}</strong>, so every demand letter and receipt reaches them twice {sentTwice(d)}.
            {canEdit ? '' : ' Ask an administrator to turn off communication for the co-buyer.'}
          </span>
          {canEdit && <Button size="sm" loading={busy === d.buyerId} disabled={busy !== null} onClick={() => turnOff(d)}>Turn off communication for {d.name}</Button>}
        </div>
      ))}
    </Alert>
  )
}
