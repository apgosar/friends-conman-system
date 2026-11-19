'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, SwitchField, useConfirm, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'

/**
 * Whether the application sends this sale's buyers their messages. A new sale starts with it off. An administrator turns it on
 * here, which sends each buyer a fresh demand letter for what is already due. Others only see the state.
 */
export default function SaleCommsSwitch({ saleId, enabled, canEdit }: { saleId: string; enabled: boolean; canEdit: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)

  if (!canEdit) return <Badge variant={enabled ? 'success' : 'muted'}>{enabled ? 'Communication On' : 'Communication Off'}</Badge>

  const change = async (next: boolean) => {
    const ok = await confirm(next
      ? { title: 'Turn on communication?', message: 'Each buyer who receives messages is sent a fresh demand letter, by email and WhatsApp, for every demand already raised and still to pay. After that, demand letters, receipts and reminders for this sale go out automatically.', confirmLabel: 'Turn on' }
      : { title: 'Turn off communication?', message: 'Nothing more is sent to the buyers of this sale until it is turned on again. Messages already sent are not affected.', confirmLabel: 'Turn off', danger: true })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetchJson(`/api/sales/${saleId}/communication`, jsonRequest('PATCH', { enabled: next }))
      toast.success(next ? (res.letters > 0 ? 'Communication is on. Demand letters are being sent' : 'Communication is on') : 'Communication is off')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return <SwitchField onLabel="Communication On" offLabel="Communication Off" checked={enabled} disabled={busy} onChange={() => change(!enabled)} />
}
