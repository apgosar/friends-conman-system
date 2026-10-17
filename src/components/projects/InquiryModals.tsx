'use client'

import { useState } from 'react'
import { INQUIRY_SOURCES, LOST_REASONS, SOURCE_LABEL, LOST_REASON_LABEL } from '@/lib/inquiry-constants'
import { Alert, Button, CheckboxField, Modal, PhoneField, SelectField, TextField, TextareaField } from '@/components/ui'
import { highlightField } from '@/lib/client/forms'
import { PHONE_ERROR, formatPhone, normalizePhone } from '@/lib/phone'
import { ApiError, errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { formatDateTime } from '@/lib/format'

export interface InquiryData {
  id: string
  customerName: string
  mobileNumber: string
  email: string | null
  totalCost: number
  agreementValue: number
  parkingIncluded: boolean
  source: string | null
  sourceDetail: string | null
  validUntil: string | null
  status: string
  lostReason: string | null
  lostNote: string | null
  lastSharedAt: string | null
  lastSharedVia: string | null
  convertedSaleId: string | null
  createdAt: string
}

const toDateInput = (d: string | null) => (d ? new Date(d).toISOString().split('T')[0] : '')

/** Validation failures name the field; add the field messages so the user can see what to fix. */
function describe(err: unknown) {
  if (err instanceof ApiError) {
    const fields = Object.values(err.fieldErrors).flat().join(', ')
    if (fields) return `${err.message}: ${fields}`
  }
  return errorMessage(err)
}

// ── Edit ────────────────────────────────────────────────────────────────────

export function EditInquiryModal({ unitId, unitNumber, inq, onClose, onDone }: {
  unitId: string; unitNumber: string; inq: InquiryData; onClose: () => void; onDone: () => void
}) {
  const [f, setF] = useState({
    customerName: inq.customerName,
    mobileNumber: inq.mobileNumber,
    email: inq.email ?? '',
    agreementValue: String(inq.agreementValue),
    parkingIncluded: inq.parkingIncluded,
    source: inq.source ?? '',
    sourceDetail: inq.sourceDetail ?? '',
    validUntil: toDateInput(inq.validUntil),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const phone = normalizePhone(f.mobileNumber)
    if (!phone.ok || !phone.value) { highlightField('edit-inquiry-mobile'); return }
    setSaving(true)
    setError('')
    try {
      await fetchJson(`/api/units/${unitId}/quotes/${inq.id}`, jsonRequest('PATCH', {
        customerName: f.customerName,
        mobileNumber: phone.value,
        email: f.email,
        agreementValue: Number(f.agreementValue),
        parkingIncluded: f.parkingIncluded,
        source: f.source || null,
        sourceDetail: f.sourceDetail || null,
        ...(f.validUntil ? { validUntil: new Date(f.validUntil + 'T23:59:59').toISOString() } : {}),
      }))
      onDone()
    } catch (err) {
      setError(describe(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Edit inquiry"
      subtitle={`Unit ${unitNumber} · changing the price or validity regenerates the quote PDF`}
      dismissible={!saving}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="edit-inquiry-form" variant="primary" loading={saving}>Save changes</Button>
        </>
      }
    >
      <form id="edit-inquiry-form" onSubmit={submit} className="flex dir-col gap-4">
        <div className="grid grid-2 gap-4">
          <TextField label="Customer name" required value={f.customerName} onChange={(e) => set('customerName', e.target.value)} />
          <PhoneField id="edit-inquiry-mobile" label="Mobile" required value={f.mobileNumber} error={normalizePhone(f.mobileNumber).ok ? undefined : PHONE_ERROR} onValueChange={(v) => set('mobileNumber', v)} />
        </div>
        <TextField label="Email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        <div className="grid grid-2 gap-4">
          <TextField label="Agreement value (₹)" required type="number" inputMode="decimal" min="1" value={f.agreementValue} onChange={(e) => set('agreementValue', e.target.value)} />
          <TextField label="Valid until" type="date" value={f.validUntil} onChange={(e) => set('validUntil', e.target.value)} />
        </div>
        <CheckboxField label="Include parking" checked={f.parkingIncluded} onChange={(e) => set('parkingIncluded', e.target.checked)} />
        <div className="grid grid-2 gap-4">
          <SelectField label="Lead source" value={f.source} onChange={(e) => set('source', e.target.value)}>
            <option value="">None</option>
            {INQUIRY_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </SelectField>
          <TextField label="Referrer / broker" disabled={!['REFERRAL', 'BROKER'].includes(f.source)} value={f.sourceDetail} onChange={(e) => set('sourceDetail', e.target.value)} />
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
      </form>
    </Modal>
  )
}

// ── Share ───────────────────────────────────────────────────────────────────

type ShareResult = { channel: string; ok: boolean; detail?: string }

export function ShareQuoteModal({ unitId, unitNumber, inq, onClose, onDone }: {
  unitId: string; unitNumber: string; inq: InquiryData; onClose: () => void; onDone: () => void
}) {
  const [email, setEmail] = useState(inq.email ?? '')
  const [viaEmail, setViaEmail] = useState(!!inq.email)
  const [viaWhatsApp, setViaWhatsApp] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<ShareResult[] | null>(null)

  const send = async () => {
    const channels = [viaEmail && 'EMAIL', viaWhatsApp && 'WHATSAPP'].filter(Boolean) as string[]
    if (channels.length === 0) return setError('Choose at least one channel')
    if (viaEmail && !email) { highlightField('share-email'); return setError('Enter an email address') }
    setSending(true)
    setError('')
    try {
      const json = await fetchJson(`/api/units/${unitId}/quotes/${inq.id}/share`, jsonRequest('POST', { channels, email: viaEmail ? email : undefined }))
      setResults(json.results)
      if (json.results.every((r: ShareResult) => r.ok)) setTimeout(onDone, 1200)
    } catch (err) {
      // a partly failed send still reports each channel's outcome
      if (err instanceof ApiError && Array.isArray(err.body.results)) setResults(err.body.results as ShareResult[])
      else setError(describe(err))
    } finally {
      setSending(false)
    }
  }

  const close = results ? onDone : onClose

  return (
    <Modal
      title="Share quote"
      subtitle={`${inq.customerName} · Unit ${unitNumber}`}
      dismissible={!sending}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>{results ? 'Close' : 'Cancel'}</Button>
          {!results && <Button variant="primary" loading={sending} onClick={send}>Send quote</Button>}
        </>
      }
    >
      <div className="flex dir-col gap-3">
        <CheckboxField label="WhatsApp" hint={formatPhone(inq.mobileNumber)} checked={viaWhatsApp} onChange={(e) => setViaWhatsApp(e.target.checked)} />
        <CheckboxField label="Email" checked={viaEmail} onChange={(e) => setViaEmail(e.target.checked)} />
        {viaEmail && <TextField id="share-email" label="Email address" type="email" placeholder="customer@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />}
        {inq.lastSharedAt && (
          <p className="text-xs text-muted m-0">Last shared {formatDateTime(inq.lastSharedAt)} via {inq.lastSharedVia?.replace('+', ' + ')}</p>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
        {results && (
          <Alert variant={results.every((r) => r.ok) ? 'success' : 'warning'}>
            {results.map((r) => <div key={r.channel}>{r.ok ? '✓' : '✗'} {r.channel}{r.detail ? `: ${r.detail}` : ''}</div>)}
          </Alert>
        )}
      </div>
    </Modal>
  )
}

// ── Mark lost ───────────────────────────────────────────────────────────────

export function LostInquiryModal({ unitId, inq, onClose, onDone }: {
  unitId: string; inq: InquiryData; onClose: () => void; onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await fetchJson(`/api/units/${unitId}/quotes/${inq.id}`, jsonRequest('PATCH', { status: 'LOST', lostReason: reason, lostNote: note || null }))
      onDone()
    } catch (err) {
      setError(describe(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Mark as lost"
      subtitle={`${inq.customerName} · ${formatPhone(inq.mobileNumber)}`}
      dismissible={!saving}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="lost-inquiry-form" variant="primary" loading={saving}>Mark lost</Button>
        </>
      }
    >
      <form id="lost-inquiry-form" onSubmit={submit} className="flex dir-col gap-4">
        <SelectField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Select a reason…</option>
          {LOST_REASONS.map((r) => <option key={r} value={r}>{LOST_REASON_LABEL[r]}</option>)}
        </SelectField>
        <TextareaField label="Note" maxLength={500} placeholder="Optional details" value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <Alert variant="danger">{error}</Alert>}
      </form>
    </Modal>
  )
}
