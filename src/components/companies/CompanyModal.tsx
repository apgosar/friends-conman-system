'use client'

import { useState } from 'react'
import { Alert, Button, Modal, TextField, TextareaField } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { scrollToFirstInvalid } from '@/lib/client/forms'
import { CompanySchema } from '@/lib/companies'

export interface CompanyData {
  id: string
  name: string
  panNumber: string | null
  gstin: string | null
  address: string
  projectCount: number
  partners: PartnerData[]
}
export interface PartnerData { id: string; name: string; address: string | null; isActive: boolean; maskedPan: string | null }

/** Add or edit a company: name, PAN, GSTIN and address. */
export default function CompanyModal({ company, onClose, onSaved }: { company: CompanyData | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: company?.name ?? '', panNumber: company?.panNumber ?? '', gstin: company?.gstin ?? '', address: company?.address ?? '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof f, v: string) => { setF((p) => ({ ...p, [k]: v })); setErrors((p) => ({ ...p, [k]: '' })) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const parsed = CompanySchema.safeParse(f)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message
      setErrors(next)
      scrollToFirstInvalid()
      return
    }
    setSaving(true)
    try {
      await fetchJson(company ? `/api/companies/${company.id}` : '/api/companies', jsonRequest(company ? 'PUT' : 'POST', parsed.data))
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={company ? 'Edit company' : 'New company'}
      subtitle={company?.name}
      dismissible={!saving}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="company-form" variant="primary" loading={saving}>Save company</Button>
        </>
      }
    >
      <form id="company-form" onSubmit={submit} noValidate className="form-floating flex dir-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <TextField label="Company Name" required value={f.name} error={errors.name || undefined} onChange={(e) => set('name', e.target.value)} placeholder="Registered name of the company or firm" />
        <div className="grid grid-2 gap-4">
          <TextField label="PAN Number" required value={f.panNumber} maxLength={10} autoCapitalize="characters" error={errors.panNumber || undefined} onChange={(e) => set('panNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="AAAPL1234C" />
          <TextField label="GSTIN" value={f.gstin} maxLength={15} autoCapitalize="characters" error={errors.gstin || undefined} onChange={(e) => set('gstin', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="27AAAAA0000A1Z5" />
        </div>
        <TextareaField label="Address" required rows={3} value={f.address} error={errors.address || undefined} onChange={(e) => set('address', e.target.value)} placeholder="Registered office address" />
      </form>
    </Modal>
  )
}
