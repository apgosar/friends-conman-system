'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BackToProject from '@/components/projects/BackToProject'
import PricingFields from '@/components/projects/PricingFields'
import CompanyField from '@/components/projects/CompanyField'
import { Alert, Button, ButtonLink, Input, RadioGroupField, SelectField, TextField, TextareaField } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'

export default function EditProjectForm({ project, companies }: { project: any; companies: { id: string; name: string }[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [parkingPricing, setParkingPricing] = useState(project.carParkingIncluded ? 'INCLUDED' : 'SEPARATE')
  const parkingIncluded = parkingPricing === 'INCLUDED'

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    const form = new FormData(e.currentTarget)
    const data: Record<string, any> = {
      name: form.get('name'),
      reraNumber: form.get('reraNumber') || null,
      address: form.get('address'),
      city: form.get('city'),
      state: form.get('state'),
      type: form.get('type'),
      status: form.get('status'),
      companyId: form.get('companyId'),
      gstRatePercent: form.get('gstRatePercent'),
      stampDutyPercent: form.get('stampDutyPercent'),
      regChargesPercent: form.get('regChargesPercent'),
      regChargesCap: form.get('regChargesCap'),
      regParkingCharges: form.get('regParkingCharges'),
      tdsRatePercent: form.get('tdsRatePercent'),
      interestRatePercent: form.get('interestRatePercent'),
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
        <div className="card-header">
          <span className="card-title">Edit Project</span>
          <BackToProject projectId={project.id} />
        </div>

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
