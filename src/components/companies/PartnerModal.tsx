'use client'

import { useState } from 'react'
import { Alert, Button, Modal, TextField, TextareaField } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { scrollToFirstInvalid } from '@/lib/client/forms'
import { PartnerSchema } from '@/lib/companies'
import type { PartnerData } from './CompanyModal'

/** Add or edit a partner of a company. A sale agreement names two of them. */
export default function PartnerModal({ companyId, companyName, partner, onClose, onSaved }: {
  companyId: string
  companyName: string
  partner: PartnerData | null
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState({ name: partner?.name ?? '', panNumber: '', address: partner?.address ?? '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof f, v: string) => { setF((p) => ({ ...p, [k]: v })); setErrors((p) => ({ ...p, [k]: '' })) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    // When editing, an untouched PAN box means "keep the PAN as it is" (it is never sent back to the screen)
    const input = { name: f.name, address: f.address, ...(partner && !f.panNumber ? {} : { panNumber: f.panNumber }) }
    const parsed = PartnerSchema.safeParse(input)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message
      setErrors(next)
      scrollToFirstInvalid()
      return
    }
    setSaving(true)
    try {
      const url = `/api/companies/${companyId}/partners${partner ? `/${partner.id}` : ''}`
      await fetchJson(url, jsonRequest(partner ? 'PUT' : 'POST', parsed.data))
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={partner ? 'Edit partner' : 'New partner'}
      subtitle={companyName}
      dismissible={!saving}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="partner-form" variant="primary" loading={saving}>Save partner</Button>
        </>
      }
    >
      <form id="partner-form" onSubmit={submit} noValidate className="form-floating flex dir-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <TextField label="Partner Name" required value={f.name} error={errors.name || undefined} onChange={(e) => set('name', e.target.value)} placeholder="Full name as it should appear in the agreement" />
        <TextField
          label="PAN Number"
          value={f.panNumber}
          maxLength={10}
          autoCapitalize="characters"
          error={errors.panNumber || undefined}
          hint={partner?.maskedPan ? `Saved: ${partner.maskedPan}. Leave empty to keep it` : 'Optional'}
          onChange={(e) => set('panNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          placeholder="ABCDE1234F"
        />
        <TextareaField label="Address" rows={3} value={f.address} error={errors.address || undefined} onChange={(e) => set('address', e.target.value)} placeholder="Optional: appears in the agreement if the template uses it" />
      </form>
    </Modal>
  )
}
