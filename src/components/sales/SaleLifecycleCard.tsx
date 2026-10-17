'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SALE_LIFECYCLE, SALE_STATUS } from '@/lib/status'
import { formatDate } from '@/lib/template-engine'
import { Button } from '@/components/ui'

const todayStr = () => new Date().toISOString().split('T')[0]
const toInput = (d: string | null) => (d ? d.split('T')[0] : todayStr())

export default function SaleLifecycleCard({ saleId, status, agreementDate, possessionDate, canEdit }: {
  saleId: string
  status: string
  agreementDate: string | null
  possessionDate: string | null
  canEdit: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<'agreement' | 'handover' | null>(null)
  const [date, setDate] = useState(todayStr())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const currentIdx = SALE_LIFECYCLE.indexOf(status as (typeof SALE_LIFECYCLE)[number])
  const cancelled = status === 'CANCELLED'

  const save = async (body: Record<string, string | null>) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/sales/${saleId}/lifecycle`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not update')
      setEditing(null)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const open = (which: 'agreement' | 'handover') => {
    setEditing(which)
    setDate(toInput(which === 'agreement' ? agreementDate : possessionDate))
    setError('')
  }

  const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, color: 'var(--color-primary)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }

  return (
    <div className="card mb-6">
      <div className="card-header"><span className="card-title">Sale Lifecycle</span></div>

      <div className="flex gap-2 wrap mb-3">
        {SALE_LIFECYCLE.map((s, i) => {
          const done = !cancelled && i < currentIdx
          const current = !cancelled && i === currentIdx
          return (
            <div key={s} title={SALE_STATUS[s].description} className="text-sm" style={{ flex: '1 1 140px', padding: '10px 12px', borderRadius: 8, border: `1px solid ${current ? 'var(--color-primary)' : 'var(--border-color)'}`, background: current ? 'var(--color-primary-light, rgba(99,102,241,0.1))' : 'var(--bg-surface)', color: done || current ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: current ? 700 : 500 }}>
              {done ? '✓ ' : current ? '● ' : ''}{SALE_STATUS[s].label}
            </div>
          )
        })}
      </div>
      <p className="text-sm text-muted" style={{ margin: '0 0 12px' }}>
        {cancelled ? SALE_STATUS.CANCELLED.description : SALE_STATUS[status]?.description}
        {' '}The status updates automatically from payments and the dates below.
      </p>

      {!cancelled && (
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {([
            ['agreement', 'Agreement signed', agreementDate, undefined],
            ['handover', 'Handover completed', possessionDate, !agreementDate ? 'Record the agreement date first' : undefined],
          ] as const).map(([key, label, value, blocked]) => (
            <div key={key} className="p-3" style={{ border: '1px solid var(--border-color)', borderRadius: 8 }}>
              <div className="text-xs text-muted mb-1" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
              {editing === key ? (
                <div className="flex gap-2 items-center wrap">
                  <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)}
                    className="text-primary" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-surface)' }} />
                  <Button variant="primary" size="sm" disabled={saving || !date}
                    onClick={() => save({ [key === 'agreement' ? 'agreementDate' : 'possessionDate']: new Date(date).toISOString() })}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                  <button style={linkBtn} onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : (
                <div className="flex justify-between items-center gap-2">
                  <span className="font-semibold">{value ? formatDate(value) : 'Pending'}</span>
                  {canEdit && (
                    blocked ? <span className="text-xs text-muted">{blocked}</span> : (
                      <span className="flex" style={{ gap: 10 }}>
                        <button style={linkBtn} onClick={() => open(key)}>{value ? 'Change' : 'Record'}</button>
                        {value && <button className="text-danger" style={{ ...linkBtn }}
                          onClick={() => window.confirm(`Clear the ${label.toLowerCase()} date? The sale status will be recalculated.`) && save({ [key === 'agreement' ? 'agreementDate' : 'possessionDate']: null })}>Clear</button>}
                      </span>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <div className="text-danger text-sm" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  )
}
