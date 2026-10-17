'use client'

import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/format'
import { Badge, Button, Card, CardHeader, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'

export default function EscalationAlerts({ escalations }: { escalations: any[] }) {
  const toast = useToast()
  const [approving, setApproving] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  async function approveSternReminder(scheduleId: string) {
    setApproving(scheduleId)
    try {
      await fetchJson('/api/escalations/approve', jsonRequest('POST', { scheduleId }))
      setDismissed((prev) => new Set(prev).add(scheduleId))
      toast.success('Stern reminder queued')
    } catch (err) {
      toast.error(errorMessage(err)) // the row stays, so nobody thinks it went out
    } finally {
      setApproving(null)
    }
  }

  const visible = escalations.filter((e) => !dismissed.has(e.id))
  if (visible.length === 0) return null

  return (
    <Card className="card-danger-soft">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="status-dot status-dot-red status-dot-pulse" />
            <span className="text-danger">Management Action Required</span>
            <Badge variant="danger">{visible.length}</Badge>
          </span>
        }
      />
      <div className="flex dir-col gap-3">
        {visible.map((esc) => (
          <div key={esc.id} className="list-row wrap">
            <div className="flex-1 min-w-0">
              <div className="font-semibold">{esc.sale?.project?.name} — {esc.sale?.unit?.unitNumber}</div>
              <div className="text-sm text-muted">{esc.sale?.buyers?.[0]?.fullName} · Demand: {esc.demandGeneratedDate ? formatDate(esc.demandGeneratedDate) : '-'}</div>
              <div className="text-sm text-danger mt-1 font-semibold">
                Outstanding: {formatCurrency(Number(esc.principalAmount) + Number(esc.gstAmount) + Number(esc.interestAmount))}
              </div>
            </div>
            <Button variant="danger" size="sm" loading={approving === esc.id} onClick={() => approveSternReminder(esc.id)} id={`approve-escalation-${esc.id}`}>
              ⚠ Send Stern Reminder
            </Button>
          </div>
        ))}
      </div>
    </Card>
  )
}
