'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Badge, Button, Modal, PhoneField, SwitchField, TextField, TextareaField, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { scrollToFirstInvalid } from '@/lib/client/forms'
import { BuyerEditSchema, formatAadhaar } from '@/lib/buyers'
import { formatPhone, phoneFieldValue } from '@/lib/phone'

export interface BuyerView {
  id: string
  fullName: string
  email: string | null
  whatsappNumber: string | null
  address: string | null
  isPrimary: boolean
  receiveComms: boolean
  maskedPan: string | null
  maskedAadhaar: string | null
}

/** One buyer of a sale. Staff who may change records can click the card to edit the buyer's details. */
export default function BuyerCard({ buyer, canEdit, footer }: { buyer: BuyerView; canEdit: boolean; footer?: ReactNode }) {
  const [editing, setEditing] = useState(false)
  const open = () => setEditing(true)

  return (
    <>
      <div
        className={canEdit ? 'detail-tile row-link' : 'detail-tile'}
        {...(canEdit && { role: 'button', tabIndex: 0, onClick: open, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } } })}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="font-semibold">{buyer.fullName}</div>
          <div className="flex gap-2">
            {buyer.isPrimary && <Badge variant="primary">Primary</Badge>}
            {buyer.receiveComms && <Badge variant="success">Comms On</Badge>}
          </div>
        </div>
        <div className="text-sm text-muted">
          {buyer.email && <div>✉ {buyer.email}</div>}
          {buyer.whatsappNumber && <div>📱 {formatPhone(buyer.whatsappNumber)}</div>}
          {buyer.maskedPan && <div>PAN: {buyer.maskedPan}</div>}
          {buyer.maskedAadhaar && <div>Aadhaar: {buyer.maskedAadhaar}</div>}
        </div>
        {footer && <div className="mt-2" onClick={(e) => e.stopPropagation()}>{footer}</div>}
      </div>
      {editing && <BuyerModal buyer={buyer} onClose={() => setEditing(false)} />}
    </>
  )
}

function BuyerModal({ buyer, onClose }: { buyer: BuyerView; onClose: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const [f, setF] = useState({
    fullName: buyer.fullName, email: buyer.email ?? '', whatsappNumber: phoneFieldValue(buyer.whatsappNumber),
    panNumber: '', aadhaarNumber: '', address: buyer.address ?? '', receiveComms: buyer.isPrimary || buyer.receiveComms,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof f, v: string | boolean) => { setF((p) => ({ ...p, [k]: v })); setErrors((p) => ({ ...p, [k]: '' })) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const parsed = BuyerEditSchema.safeParse(f)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message
      setErrors(next)
      scrollToFirstInvalid()
      return
    }
    setSaving(true)
    try {
      await fetchJson(`/api/buyers/${buyer.id}`, jsonRequest('PUT', f)) // what was typed: the server reads it as the screen did
      toast.success('Buyer details saved')
      router.refresh()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Edit buyer"
      subtitle={buyer.fullName}
      dismissible={!saving}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="buyer-form" variant="primary" loading={saving}>Save buyer</Button>
        </>
      }
    >
      <form id="buyer-form" onSubmit={submit} noValidate className="form-floating flex dir-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <TextField label="Full Name" required value={f.fullName} error={errors.fullName || undefined} onChange={(e) => set('fullName', e.target.value)} />
        <TextField label="Email" type="email" value={f.email} error={errors.email || undefined} onChange={(e) => set('email', e.target.value)} />
        <PhoneField label="WhatsApp" value={f.whatsappNumber} onValueChange={(v) => set('whatsappNumber', v)} error={errors.whatsappNumber || undefined} />
        <TextField
          label="PAN Number"
          value={f.panNumber}
          maxLength={10}
          autoCapitalize="characters"
          error={errors.panNumber || undefined}
          hint={buyer.maskedPan ? `Saved: ${buyer.maskedPan}. Leave empty to keep it` : 'Not added yet'}
          onChange={(e) => set('panNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          placeholder="ABCDE1234F"
        />
        <TextField
          label="Aadhaar Number"
          value={f.aadhaarNumber}
          inputMode="numeric"
          error={errors.aadhaarNumber || undefined}
          hint={buyer.maskedAadhaar ? `Saved: ${buyer.maskedAadhaar}. Leave empty to keep it` : 'Not added yet'}
          onChange={(e) => set('aadhaarNumber', formatAadhaar(e.target.value))}
          placeholder="1234 5678 9012"
        />
        <TextareaField label="Address" rows={3} value={f.address} error={errors.address || undefined} onChange={(e) => set('address', e.target.value)} />
        <div>
          <SwitchField onLabel="Communication On" offLabel="Communication Off" checked={f.receiveComms} disabled={buyer.isPrimary} onChange={(e) => set('receiveComms', e.target.checked)} />
          {buyer.isPrimary && <p className="text-sm text-muted mt-1">The primary buyer always receives demand letters and receipts</p>}
        </div>
      </form>
    </Modal>
  )
}
