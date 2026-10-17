'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BackToProject from '@/components/projects/BackToProject'
import PricingFields from '@/components/projects/PricingFields'
import { Button, ButtonLink, Input, Select, SelectField, TextField, Textarea, TextareaField } from '@/components/ui'

export default function EditProjectForm({ project }: { project: any }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
      companyName: form.get('companyName'),
      companyAddress: form.get('companyAddress'),
      companyGstin: form.get('companyGstin') || null,
      gstRatePercent: form.get('gstRatePercent'),
      stampDutyPercent: form.get('stampDutyPercent'),
      regChargesPercent: form.get('regChargesPercent'),
      regChargesCap: form.get('regChargesCap'),
      regParkingCharges: form.get('regParkingCharges'),
      tdsRatePercent: form.get('tdsRatePercent'),
      interestRatePercent: form.get('interestRatePercent'),
      carParkingCharges: Number(form.get('carParkingCharges')),
    }
    const launchDate = form.get('launchDate')
    const expectedCompletion = form.get('expectedCompletion')
    if (launchDate) data.launchDate = launchDate
    if (expectedCompletion) data.expectedCompletion = expectedCompletion

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to update project')
      setSuccess('Project updated successfully!')
      setTimeout(() => router.push(`/projects/${project.id}`), 1200)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Edit Project</span>
          <BackToProject projectId={project.id} />
        </div>

        {error && <div className="alert alert-danger mb-4">{error}</div>}
        {success && <div className="alert alert-success mb-4">{success}</div>}

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
          <h4 className="mb-4">Company / Developer Details</h4>

          <div className="grid grid-2 gap-4 mb-4">
            <TextField label="Company Name" name="companyName" required defaultValue={project.companyName} />
            <TextField label="GSTIN" name="companyGstin" defaultValue={project.companyGstin ?? ''} placeholder="27AAAAA0000A1Z5" />
          </div>
          <TextareaField label="Company Address" wrapperClassName="mb-4" name="companyAddress" required rows={2} defaultValue={project.companyAddress} />

          <div className="divider" />
          <h4 className="mb-1">Tax and pricing</h4>
          <p className="form-hint mb-4">Used for new sales, demand letters and overdue interest in this project. Sales already created keep the figures they were created with.</p>

          <PricingFields values={project} />

          <div className="grid grid-3 gap-4 mb-6">
            <div className="form-group">
              <label className="form-label" htmlFor="carParkingCharges">Car Parking Charges (₹)</label>
              <Input
                id="carParkingCharges"
                name="carParkingCharges"
                type="number"
                step="1000"
                defaultValue={project.carParkingCharges ?? 500000}
              />
              <span className="form-hint">Used as default when creating a new sale with parking</span>
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
