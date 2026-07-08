'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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
      stampDutyPercent: Number(form.get('stampDutyPercent')),
      regChargesPercent: Number(form.get('regChargesPercent')),
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
          <Link href={`/projects/${project.id}`} className="btn btn-ghost btn-sm">← Back</Link>
        </div>

        {error && <div className="alert alert-danger mb-4">{error}</div>}
        {success && <div className="alert alert-success mb-4">{success}</div>}

        <form onSubmit={handleSubmit}>
          {/* ── Basic Info ── */}
          <div className="grid grid-2 gap-4 mb-4">
            <div className="form-group">
              <label className="form-label">Project Name *</label>
              <input name="name" className="form-input" required defaultValue={project.name} />
            </div>
            <div className="form-group">
              <label className="form-label">Project Type *</label>
              <select name="type" className="form-select" defaultValue={project.type}>
                <option value="FRESH">Fresh Sale</option>
                <option value="REDEVELOPMENT">Redevelopment</option>
                <option value="MIXED">Mixed</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">RERA Number</label>
              <input name="reraNumber" className="form-input" defaultValue={project.reraNumber ?? ''} placeholder="P52100012345" />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select name="status" className="form-select" defaultValue={project.status}>
                <option value="PLANNING">Planning</option>
                <option value="UNDER_CONSTRUCTION">Under Construction</option>
                <option value="READY">Ready</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">City *</label>
              <input name="city" className="form-input" required defaultValue={project.city} />
            </div>
            <div className="form-group">
              <label className="form-label">State</label>
              <input name="state" className="form-input" defaultValue={project.state} />
            </div>
            <div className="form-group">
              <label className="form-label">Launch Date</label>
              <input name="launchDate" type="date" className="form-input"
                defaultValue={project.launchDate ? new Date(project.launchDate).toISOString().split('T')[0] : ''} />
            </div>
            <div className="form-group">
              <label className="form-label">Expected Completion</label>
              <input name="expectedCompletion" type="date" className="form-input"
                defaultValue={project.expectedCompletion ? new Date(project.expectedCompletion).toISOString().split('T')[0] : ''} />
            </div>
          </div>

          <div className="form-group mb-4">
            <label className="form-label">Project Address *</label>
            <textarea name="address" className="form-textarea" required rows={2} defaultValue={project.address} />
          </div>

          <div className="divider" />
          <h4 style={{ marginBottom: 16 }}>Company / Developer Details</h4>

          <div className="grid grid-2 gap-4 mb-4">
            <div className="form-group">
              <label className="form-label">Company Name *</label>
              <input name="companyName" className="form-input" required defaultValue={project.companyName} />
            </div>
            <div className="form-group">
              <label className="form-label">GSTIN</label>
              <input name="companyGstin" className="form-input" defaultValue={project.companyGstin ?? ''} placeholder="27AAAAA0000A1Z5" />
            </div>
          </div>
          <div className="form-group mb-4">
            <label className="form-label">Company Address *</label>
            <textarea name="companyAddress" className="form-textarea" required rows={2} defaultValue={project.companyAddress} />
          </div>

          <div className="divider" />
          <h4 style={{ marginBottom: 16 }}>Financial Defaults</h4>

          <div className="grid grid-3 gap-4 mb-6">
            <div className="form-group">
              <label className="form-label">Stamp Duty %</label>
              <input name="stampDutyPercent" type="number" step="0.01" className="form-input" defaultValue={project.stampDutyPercent} />
            </div>
            <div className="form-group">
              <label className="form-label">Reg. Charges %</label>
              <input name="regChargesPercent" type="number" step="0.01" className="form-input" defaultValue={project.regChargesPercent} />
            </div>
            <div className="form-group">
              <label className="form-label">Car Parking Charges (₹)</label>
              <input
                name="carParkingCharges"
                type="number"
                step="1000"
                className="form-input"
                defaultValue={project.carParkingCharges ?? 500000}
              />
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                Used as default when creating a new sale with parking
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link href={`/projects/${project.id}`} className="btn btn-secondary">Cancel</Link>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
