'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useConfirm, useToast } from '@/components/ui'
import { errorMessage, fetchJson } from '@/lib/client/api'
import { DEMAND_DUE_DAYS } from '@/lib/payment-plans'

/** A demand with no milestone to trigger it (stamp duty and registration) is raised by hand: the demand letter goes to the buyers. */
export default function RaiseDemandButton({ scheduleId, description }: { scheduleId: string; description: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function raise(e: React.MouseEvent) {
    e.stopPropagation() // the row itself opens the payment details
    const ok = await confirm({
      title: `Raise the demand for ${description}?`,
      message: `A demand letter is sent to the buyers by email and WhatsApp, and the amount falls due in ${DEMAND_DUE_DAYS} days.`,
      confirmLabel: 'Raise demand',
    })
    if (!ok) return
    setBusy(true)
    try {
      await fetchJson(`/api/schedules/${scheduleId}/raise-demand`, { method: 'POST' })
      toast.success('Demand raised and sent')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return <Button size="sm" variant="primary" loading={busy} onClick={raise}>Raise demand</Button>
}
