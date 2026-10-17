'use client'

import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/template-engine'

export default function EscalationAlerts({ escalations }: { escalations: any[] }) {
  const [approving, setApproving] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  async function approveSternReminder(scheduleId: string) {
    setApproving(scheduleId)
    await fetch('/api/escalations/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleId }),
    })
    setDismissed((prev) => new Set(prev).add(scheduleId))
    setApproving(null)
  }

  const visible = escalations.filter((e) => !dismissed.has(e.id))
  if (visible.length === 0) return null

  return (
    <div className="card" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.04)' }}>
      <div className="card-header">
        <div className="flex items-center gap-2">
          <span className="status-dot status-dot-red status-dot-pulse" />
          <span className="card-title text-danger">Management Action Required</span>
          <span className="badge badge-danger">{visible.length}</span>
        </div>
      </div>
      <div className="flex dir-col" style={{ gap: 10 }}>
        {visible.map((esc) => (
          <div
            key={esc.id}
            className="flex items-center justify-between gap-4 wrap" style={{ padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)' }}
          >
            <div className="flex-1" style={{ minWidth: 200 }}>
              <div className="font-semibold" style={{ marginBottom: 2 }}>
                {esc.sale?.project?.name} — {esc.sale?.unit?.unitNumber}
              </div>
              <div className="text-sm text-muted">
                {esc.sale?.buyers?.[0]?.fullName} · Demand: {esc.demandGeneratedDate ? formatDate(esc.demandGeneratedDate) : '-'}
              </div>
              <div className="text-sm text-danger mt-1 font-semibold">
                Outstanding: {formatCurrency(Number(esc.principalAmount) + Number(esc.gstAmount) + Number(esc.interestAmount))}
              </div>
            </div>
            <button
              className="btn btn-danger btn-sm"
              disabled={approving === esc.id}
              onClick={() => approveSternReminder(esc.id)}
              id={`approve-escalation-${esc.id}`}
            >
              {approving === esc.id ? 'Sending…' : '⚠ Send Stern Reminder'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
