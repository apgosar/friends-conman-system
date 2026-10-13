'use client'

import { useState } from 'react'
import { INQUIRY_SOURCES, LOST_REASONS, SOURCE_LABEL, LOST_REASON_LABEL } from '@/lib/inquiry-constants'

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

const input: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
  background: 'var(--bg-surface)', outline: 'none', fontSize: '0.875rem', color: 'var(--text-primary)', boxSizing: 'border-box',
}
const label: React.CSSProperties = { display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }

const toDateInput = (d: string | null) => (d ? new Date(d).toISOString().split('T')[0] : '')

function Shell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--bg-card)', width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', borderRadius: 12, boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>{title}</h3>
            {subtitle && <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  )
}

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const json = await res.json().catch(() => ({}))
  if (!res.ok && !json.results) {
    const detail = json.details?.fieldErrors ? Object.values(json.details.fieldErrors).flat().join(', ') : ''
    throw new Error([json.error, detail].filter(Boolean).join(': ') || 'Request failed')
  }
  return json
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
    setSaving(true)
    setError('')
    try {
      await call(`/api/units/${unitId}/quotes/${inq.id}`, 'PATCH', {
        customerName: f.customerName,
        mobileNumber: f.mobileNumber,
        email: f.email,
        agreementValue: Number(f.agreementValue),
        parkingIncluded: f.parkingIncluded,
        source: f.source || null,
        sourceDetail: f.sourceDetail || null,
        ...(f.validUntil ? { validUntil: new Date(f.validUntil + 'T23:59:59').toISOString() } : {}),
      })
      onDone()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell title="Edit Inquiry" subtitle={`Unit ${unitNumber} · changing price or validity regenerates the quote PDF`} onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div><label style={label}>Customer Name</label><input required style={input} value={f.customerName} onChange={(e) => set('customerName', e.target.value)} /></div>
          <div><label style={label}>Mobile</label><input required style={input} maxLength={10} pattern="[0-9]{10}" title="10-digit mobile number" value={f.mobileNumber} onChange={(e) => set('mobileNumber', e.target.value.replace(/\D/g, ''))} /></div>
        </div>
        <div style={{ marginBottom: 12 }}><label style={label}>Email</label><input type="email" style={input} value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div><label style={label}>Agreement Value (₹)</label><input required type="number" min="1" style={input} value={f.agreementValue} onChange={(e) => set('agreementValue', e.target.value)} /></div>
          <div><label style={label}>Valid Until</label><input type="date" style={input} value={f.validUntil} onChange={(e) => set('validUntil', e.target.value)} /></div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={f.parkingIncluded} onChange={(e) => set('parkingIncluded', e.target.checked)} /> Include parking
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={label}>Lead Source</label>
            <select style={input} value={f.source} onChange={(e) => set('source', e.target.value)}>
              <option value="">—</option>
              {INQUIRY_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
            </select>
          </div>
          <div><label style={label}>Referrer / Broker</label><input style={input} disabled={!['REFERRAL', 'BROKER'].includes(f.source)} value={f.sourceDetail} onChange={(e) => set('sourceDetail', e.target.value)} /></div>
        </div>
        {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </form>
    </Shell>
  )
}

// ── Share ───────────────────────────────────────────────────────────────────

export function ShareQuoteModal({ unitId, unitNumber, inq, onClose, onDone }: {
  unitId: string; unitNumber: string; inq: InquiryData; onClose: () => void; onDone: () => void
}) {
  const [email, setEmail] = useState(inq.email ?? '')
  const [viaEmail, setViaEmail] = useState(!!inq.email)
  const [viaWhatsApp, setViaWhatsApp] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<{ channel: string; ok: boolean; detail?: string }[] | null>(null)

  const send = async () => {
    const channels = [viaEmail && 'EMAIL', viaWhatsApp && 'WHATSAPP'].filter(Boolean) as string[]
    if (channels.length === 0) return setError('Choose at least one channel')
    if (viaEmail && !email) return setError('Enter an email address')
    setSending(true)
    setError('')
    try {
      const json = await call(`/api/units/${unitId}/quotes/${inq.id}/share`, 'POST', { channels, email: viaEmail ? email : undefined })
      setResults(json.results)
      if (json.results.every((r: any) => r.ok)) setTimeout(onDone, 1200)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Shell title="Share Quote" subtitle={`${inq.customerName} · Unit ${unitNumber}`} onClose={results ? onDone : onClose}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, marginBottom: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={viaWhatsApp} onChange={(e) => setViaWhatsApp(e.target.checked)} />
        <div><div style={{ fontWeight: 600, fontSize: '0.875rem' }}>WhatsApp</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>+91 {inq.mobileNumber}</div></div>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, marginBottom: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={viaEmail} onChange={(e) => setViaEmail(e.target.checked)} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: viaEmail ? 6 : 0 }}>Email</div>
          {viaEmail && <input type="email" placeholder="customer@example.com" style={input} value={email} onChange={(e) => setEmail(e.target.value)} onClick={(e) => e.preventDefault()} />}
        </div>
      </label>
      {inq.lastSharedAt && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Last shared {new Date(inq.lastSharedAt).toLocaleString('en-IN')} via {inq.lastSharedVia?.replace('+', ' + ')}
        </p>
      )}
      {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginBottom: 12 }}>{error}</div>}
      {results && (
        <div style={{ marginBottom: 12, fontSize: '0.8125rem' }}>
          {results.map((r) => (
            <div key={r.channel} style={{ color: r.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
              {r.ok ? '✓' : '✗'} {r.channel}{r.detail ? ` — ${r.detail}` : ''}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={results ? onDone : onClose}>{results ? 'Close' : 'Cancel'}</button>
        {!results && <button type="button" className="btn btn-primary" disabled={sending} onClick={send}>{sending ? 'Sending…' : 'Send Quote'}</button>}
      </div>
    </Shell>
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
      await call(`/api/units/${unitId}/quotes/${inq.id}`, 'PATCH', { status: 'LOST', lostReason: reason, lostNote: note || null })
      onDone()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell title="Mark as Lost" subtitle={`${inq.customerName} · ${inq.mobileNumber}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 12 }}>
          <label style={label}>Reason *</label>
          <select required style={input} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">— Select a reason —</option>
            {LOST_REASONS.map((r) => <option key={r} value={r}>{LOST_REASON_LABEL[r]}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={label}>Note</label>
          <textarea style={{ ...input, minHeight: 70 }} maxLength={500} placeholder="Optional details" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Mark Lost'}</button>
        </div>
      </form>
    </Shell>
  )
}
