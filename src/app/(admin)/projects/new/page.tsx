'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'

export default function NewProjectPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(e.currentTarget)
    const data = Object.fromEntries(form.entries())
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(json.error ?? 'Failed to create project')
    } else {
      router.push(`/projects/${json.data.id}`)
    }
  }

  return (
    <>
      <TopNav title="New Project" subtitle="Set up a new property project" />
      <div className="admin-content">
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Project Details</span>
            </div>
            {error && <div className="alert alert-danger mb-4">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="grid grid-2 gap-4 mb-4">
                <div className="form-group">
                  <label className="form-label">Project Name *</label>
                  <input name="name" className="form-input" required placeholder="Sunrise Heights" />
                </div>
                <div className="form-group">
                  <label className="form-label">Project Type *</label>
                  <select name="type" className="form-select" required>
                    <option value="FRESH">Fresh Sale</option>
                    <option value="REDEVELOPMENT">Redevelopment</option>
                    <option value="MIXED">Mixed</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">RERA Number</label>
                  <input name="reraNumber" className="form-input" placeholder="P52100012345" />
                </div>
                <div className="form-group">
                  <label className="form-label">City *</label>
                  <input name="city" className="form-input" required placeholder="Mumbai" />
                </div>
                <div className="form-group">
                  <label className="form-label">State</label>
                  <input name="state" className="form-input" defaultValue="Maharashtra" />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select name="status" className="form-select">
                    <option value="PLANNING">Planning</option>
                    <option value="UNDER_CONSTRUCTION">Under Construction</option>
                    <option value="READY">Ready</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
              </div>
              <div className="form-group mb-4">
                <label className="form-label">Project Address *</label>
                <textarea name="address" className="form-textarea" required placeholder="Plot No. 45, Survey No. 123, Andheri East..." style={{ minHeight: 80 }} />
              </div>
              <div className="grid grid-2 gap-4 mb-4">
                <div className="form-group">
                  <label className="form-label">Launch Date</label>
                  <input name="launchDate" type="date" className="form-input" />
                </div>
                <div className="form-group">
                  <label className="form-label">Expected Completion</label>
                  <input name="expectedCompletion" type="date" className="form-input" />
                </div>
              </div>
              <div className="divider" />
              <h4 style={{ marginBottom: 16 }}>Company / Developer Details</h4>
              <div className="grid grid-2 gap-4 mb-4">
                <div className="form-group">
                  <label className="form-label">Company Name *</label>
                  <input name="companyName" className="form-input" required placeholder="Friends Construction Pvt. Ltd." />
                </div>
                <div className="form-group">
                  <label className="form-label">GSTIN</label>
                  <input name="companyGstin" className="form-input" placeholder="27AAAAA0000A1Z5" />
                </div>
                <div className="form-group">
                  <label className="form-label">Stamp Duty %</label>
                  <input name="stampDutyPercent" type="number" step="0.01" className="form-input" defaultValue="5" />
                </div>
                <div className="form-group">
                  <label className="form-label">Registration Charges %</label>
                  <input name="regChargesPercent" type="number" step="0.01" className="form-input" defaultValue="1" />
                </div>
              </div>
              <div className="form-group mb-6">
                <label className="form-label">Company Address *</label>
                <textarea name="companyAddress" className="form-textarea" required placeholder="Office No. 501, XYZ Building..." style={{ minHeight: 80 }} />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" className="btn btn-secondary" onClick={() => router.back()}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading} id="create-project-btn">
                  {loading ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
