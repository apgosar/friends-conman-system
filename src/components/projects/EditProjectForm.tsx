'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import PricingFields from '@/components/projects/PricingFields'
import CompanyField from '@/components/projects/CompanyField'
import { Alert, Button, ButtonLink, Input, RadioGroupField, SelectField, TextField, TextareaField } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { CONTACT_NUMBERS_ERROR } from '@/lib/companies'
import { normalizePhoneList } from '@/lib/phone'

export default function EditProjectForm({ project, companies }: { project: any; companies: { id: string; name: string; contactNumbers: string | null }[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [parkingPricing, setParkingPricing] = useState(project.carParkingIncluded ? 'INCLUDED' : 'SEPARATE')
  const parkingIncluded = parkingPricing === 'INCLUDED'
  const [contactError, setContactError] = useState('')
  const [editingContact, setEditingContact] = useState(false)
  const contactRef = useRef<HTMLInputElement>(null)
  const companyContact = companies.find((c) => c.id === project.companyId)?.contactNumbers ?? ''

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    const form = new FormData(e.currentTarget)
    if (!normalizePhoneList(String(form.get('contactNumbers') ?? '')).ok) {
      setContactError(CONTACT_NUMBERS_ERROR)
      setLoading(false)
      return
    }
    setContactError('')
    const data: Record<string, any> = {
      name: form.get('name'),
      reraNumber: form.get('reraNumber') || null,
      address: form.get('address'),
      city: form.get('city'),
      state: form.get('state'),
      type: form.get('type'),
      status: form.get('status'),
      companyId: form.get('companyId'),
      contactNumbers: form.get('contactNumbers') ?? '',
      gstRatePercent: form.get('gstRatePercent'),
      stampDutyPercent: form.get('stampDutyPercent'),
      regChargesPercent: form.get('regChargesPercent'),
      regChargesCap: form.get('regChargesCap'),
      regParkingCharges: form.get('regParkingCharges'),
      tdsRatePercent: form.get('tdsRatePercent'),
      // A greyed-out box is not part of the form: keep the charge that is saved
      carParkingCharges: parkingIncluded ? Number(project.carParkingCharges ?? 500000) : Number(form.get('carParkingCharges')),
      carParkingIncluded: parkingIncluded,
    }
    const launchDate = form.get('launchDate')
    const expectedCompletion = form.get('expectedCompletion')
    if (launchDate) data.launchDate = launchDate
    if (expectedCompletion) data.expectedCompletion = expectedCompletion

    try {
      await fetchJson(`/api/projects/${project.id}`, jsonRequest('PATCH', data))
      setSuccess('Project updated')
      setTimeout(() => router.push(`/projects/${project.id}`), 1200)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="card">
        {error && <Alert variant="danger" className="mb-4">{error}</Alert>}
        {success && <Alert variant="success" className="mb-4">{success}</Alert>}

        <form onSubmit={handleSubmit}>
          {/* ── Basic Info ── */}
          <div className="grid grid-2 gap-4 mb-4">
            <TextField label="Project Name" name="name" required defaultValue={project.name} />
            <SelectField label="Project Type *" name="type" defaultValue={project.type}><option value="FRESH">Fresh Sale</option><option value="REDEVELOPMENT">Redevelopment</option><option value="MIXED">Mixed</option></SelectField>
            <TextField label="RERA Number" name="reraNumber" defaultValue={project.reraNumber ?? ''} placeholder="P52100012345" />
            <SelectField label="Status" name="status" defaultValue={project.status}><option value="PLANNING">Planning</option><option value="UNDER_CONSTRUCTION">Under Construction</option><option value="READY">Ready</option><option value="COMPLETED">Completed</option></SelectField>
            <TextField label="City" name="city" required defaultValue={project.city} />
            <TextField label="State" name="state" defaultValue={project.state} />
            <TextField label="Launch Date" name="launchDate" type="date" defaultValue={project.launchDate ? new Date(project.launchDate).toISOString().split('T')[0] : ''} />
            <TextField label="Expected Completion" name="expectedCompletion" type="date" defaultValue={project.expectedCompletion ? new Date(project.expectedCompletion).toISOString().split('T')[0] : ''} />
          </div>

          <TextareaField label="Project Address" wrapperClassName="mb-4" name="address" required rows={2} defaultValue={project.address} />

          <div className="divider" />
          <h4 className="mb-4">Company</h4>
          <CompanyField companies={companies} defaultValue={project.companyId} />
          <div className="form-group mb-4">
            <label className="form-label" htmlFor="contactNumbers">Contact Numbers</label>
            <div className="input-with-action">
              <Input
                id="contactNumbers"
                name="contactNumbers"
                ref={contactRef}
                defaultValue={project.contactNumbers ?? companyContact}
                readOnly={!editingContact}
                invalid={!!contactError}
                placeholder="9876543210, 9123456789"
              />
              {!editingContact && (
                <button type="button" className="input-action" aria-label="Edit contact numbers" title="Edit" onClick={() => { setEditingContact(true); setTimeout(() => contactRef.current?.focus(), 0) }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
                    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              )}
            </div>
            {contactError
              ? <span className="field-error" role="alert">{contactError}</span>
              : <span className="form-hint">{companyContact ? 'Shown to buyers in WhatsApp demand letters and receipts. Filled in from the company: press Edit to give this project its own numbers, separated by commas' : 'Shown to buyers in WhatsApp demand letters and receipts. The company has no numbers yet: add them under Companies, or press Edit to type numbers for this project, separated by commas'}</span>}
          </div>

          <div className="divider" />
          <h4 className="mb-1">Tax and pricing</h4>
          <p className="form-hint mb-4">Used for new sales, demand letters and overdue interest in this project. Sales already created keep the figures they were created with.</p>

          <PricingFields values={project} />

          <div className="grid grid-2 gap-4 mb-6">
            <RadioGroupField
              label="Car parking pricing"
              name="carParkingIncluded"
              value={parkingPricing}
              onChange={setParkingPricing}
              options={[{ value: 'SEPARATE', label: 'Charged separately' }, { value: 'INCLUDED', label: 'Included in the agreement value' }]}
              hint="Included means new sales carry no parking amount"
            />
            <div className="form-group">
              <label className="form-label" htmlFor="carParkingCharges">Car Parking Charges (₹)</label>
              <Input
                id="carParkingCharges"
                name="carParkingCharges"
                type="number"
                step="1000"
                defaultValue={project.carParkingCharges ?? 500000}
                disabled={parkingIncluded}
              />
              <span className="form-hint">{parkingIncluded ? 'Not used: parking is included in the agreement value' : 'Per car park. Used when a new sale has parking charged separately'}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <ButtonLink href={`/projects/${project.id}`} variant="secondary">Cancel</ButtonLink>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
