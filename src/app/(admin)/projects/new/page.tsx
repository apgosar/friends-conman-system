'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import PricingFields from '@/components/projects/PricingFields'
import { Button, Input, Select, Textarea } from '@/components/ui'

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
      router.push(`/projects/${json.data.id}/structure?new=1`) // next step: describe the building
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
                  <Input name="name" required placeholder="Sunrise Heights" />
                </div>
                <div className="form-group">
                  <label className="form-label">Project Type *</label>
                  <Select name="type" required>
                    <option value="FRESH">Fresh Sale</option>
                    <option value="REDEVELOPMENT">Redevelopment</option>
                    <option value="MIXED">Mixed</option>
                  </Select>
                </div>
                <div className="form-group">
                  <label className="form-label">RERA Number</label>
                  <Input name="reraNumber" placeholder="P52100012345" />
                </div>
                <div className="form-group">
                  <label className="form-label">City *</label>
                  <Input name="city" required placeholder="Mumbai" />
                </div>
                <div className="form-group">
                  <label className="form-label">State</label>
                  <Input name="state" defaultValue="Maharashtra" />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <Select name="status">
                    <option value="PLANNING">Planning</option>
                    <option value="UNDER_CONSTRUCTION">Under Construction</option>
                    <option value="READY">Ready</option>
                    <option value="COMPLETED">Completed</option>
                  </Select>
                </div>
              </div>
              <div className="form-group mb-4">
                <label className="form-label">Project Address *</label>
                <Textarea name="address" required placeholder="Plot No. 45, Survey No. 123, Andheri East..." style={{ minHeight: 80 }} />
              </div>
              <div className="grid grid-2 gap-4 mb-4">
                <div className="form-group">
                  <label className="form-label">Launch Date</label>
                  <Input name="launchDate" type="date" />
                </div>
                <div className="form-group">
                  <label className="form-label">Expected Completion</label>
                  <Input name="expectedCompletion" type="date" />
                </div>
              </div>
              <div className="divider" />
              <h4 className="mb-4">Company / Developer Details</h4>
              <div className="grid grid-2 gap-4 mb-4">
                <div className="form-group">
                  <label className="form-label">Company Name *</label>
                  <Input name="companyName" required placeholder="Your company's registered name" />
                </div>
                <div className="form-group">
                  <label className="form-label">GSTIN</label>
                  <Input name="companyGstin" placeholder="27AAAAA0000A1Z5" />
                </div>
              </div>
              <h4 style={{ margin: '8px 0 4px' }}>Tax and pricing</h4>
              <p className="form-hint mb-3">Defaults suit Maharashtra. Change them if this project&apos;s state or year differs; you can edit them later.</p>
              <PricingFields />
              <div className="form-group mb-6">
                <label className="form-label">Company Address *</label>
                <Textarea name="companyAddress" required placeholder="Office No. 501, XYZ Building..." style={{ minHeight: 80 }} />
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={loading} id="create-project-btn">
                  {loading ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
