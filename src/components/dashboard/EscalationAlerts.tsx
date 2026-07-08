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
          <span className="card-title" style={{ color: 'var(--color-danger)' }}>Management Action Required</span>
          <span className="badge badge-danger">{visible.length}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map((esc) => (
          <div
            key={esc.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              background: 'var(--bg-card)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 'var(--radius-md)',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {esc.sale?.project?.name} — {esc.sale?.unit?.unitNumber}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                {esc.sale?.buyers?.[0]?.fullName} · Demand: {esc.demandGeneratedDate ? formatDate(esc.demandGeneratedDate) : '-'}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-danger)', marginTop: 4, fontWeight: 600 }}>
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
