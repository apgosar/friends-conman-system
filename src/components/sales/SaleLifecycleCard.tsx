'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SALE_LIFECYCLE, SALE_STATUS } from '@/lib/status'
import { formatDate } from '@/lib/format'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { Alert, Button, Card, CardHeader, Input, cn, useConfirm } from '@/components/ui'

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
  const confirm = useConfirm()
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
      await fetchJson(`/api/sales/${saleId}/lifecycle`, jsonRequest('PATCH', body))
      setEditing(null)
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const open = (which: 'agreement' | 'handover') => {
    setEditing(which)
    setDate(toInput(which === 'agreement' ? agreementDate : possessionDate))
    setError('')
  }

  const clear = async (field: string, label: string) => {
    const ok = await confirm({ message: `Clear the ${label.toLowerCase()} date? The sale status will be recalculated.`, confirmLabel: 'Clear date', danger: true })
    if (ok) save({ [field]: null })
  }

  return (
    <Card className="mb-6">
      <CardHeader title="Sale Lifecycle" />

      <div className="step-chips mb-3">
        {SALE_LIFECYCLE.map((s, i) => {
          const done = !cancelled && i < currentIdx
          const current = !cancelled && i === currentIdx
          return (
            <div key={s} title={SALE_STATUS[s].description} className={cn('step-chip', done && 'is-done', current && 'is-current')}>
              {done ? '✓ ' : current ? '● ' : ''}{SALE_STATUS[s].label}
            </div>
          )
        })}
      </div>
      <p className="text-sm text-muted mt-0 mb-3">
        {cancelled ? SALE_STATUS.CANCELLED.description : SALE_STATUS[status]?.description}
        {' '}The status updates automatically from payments and the dates below.
      </p>

      {!cancelled && (
        <div className="grid grid-2 gap-3">
          {([
            ['agreement', 'Agreement signed', 'agreementDate', agreementDate, undefined],
            ['handover', 'Handover completed', 'possessionDate', possessionDate, !agreementDate ? 'Record the agreement date first' : undefined],
          ] as const).map(([key, label, field, value, blocked]) => (
            <div key={key} className="detail-tile">
              <div className="label-caps mb-1">{label}</div>
              {editing === key ? (
                <div className="flex gap-2 items-center wrap">
                  <Input type="date" aria-label={label} value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} className="w-auto" />
                  <Button variant="primary" size="sm" loading={saving} disabled={!date} onClick={() => save({ [field]: new Date(date).toISOString() })}>Save</Button>
                  <button type="button" className="link-btn" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : (
                <div className="flex justify-between items-center gap-2">
                  <span className="font-semibold">{value ? formatDate(value) : 'Pending'}</span>
                  {canEdit && (
                    blocked ? <span className="text-xs text-muted">{blocked}</span> : (
                      <span className="flex gap-3">
                        <button type="button" className="link-btn" onClick={() => open(key)}>{value ? 'Change' : 'Record'}</button>
                        {value && <button type="button" className="link-btn link-btn-danger" onClick={() => clear(field, label)}>Clear</button>}
                      </span>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
    </Card>
  )
}
