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
  contactNumbers: string | null
  letterheadUrl: string | null
  quoteMarginTopMm: number
  quoteMarginBottomMm: number
  projectCount: number
  partners: PartnerData[]
}
export interface PartnerData { id: string; name: string; address: string | null; isActive: boolean; maskedPan: string | null }

/** Add or edit a company: name, PAN, GSTIN and address. */
export default function CompanyModal({ company, onClose, onSaved }: { company: CompanyData | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: company?.name ?? '', panNumber: company?.panNumber ?? '', gstin: company?.gstin ?? '', address: company?.address ?? '', contactNumbers: company?.contactNumbers ?? '', quoteMarginTopMm: String(company?.quoteMarginTopMm ?? 40), quoteMarginBottomMm: String(company?.quoteMarginBottomMm ?? 30) })
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
      await fetchJson(company ? `/api/companies/${company.id}` : '/api/companies', jsonRequest(company ? 'PUT' : 'POST', f)) // what was typed: the server reads it as the screen did
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
        <TextField label="Contact Numbers" value={f.contactNumbers} error={errors.contactNumbers || undefined} hint="Shown to buyers in WhatsApp demand letters and receipts. Separate several numbers with a comma. A project can use its own" onChange={(e) => set('contactNumbers', e.target.value)} placeholder="9876543210, 9123456789" />
        <div className="grid grid-2 gap-4">
          <TextField label="Letterhead: top margin (mm)" type="number" inputMode="numeric" value={f.quoteMarginTopMm} error={errors.quoteMarginTopMm || undefined} hint="Room the logo needs at the top of a quotation page" onChange={(e) => set('quoteMarginTopMm', e.target.value)} />
          <TextField label="Letterhead: bottom margin (mm)" type="number" inputMode="numeric" value={f.quoteMarginBottomMm} error={errors.quoteMarginBottomMm || undefined} hint="Room the address needs at the bottom" onChange={(e) => set('quoteMarginBottomMm', e.target.value)} />
        </div>
      </form>
    </Modal>
  )
}
