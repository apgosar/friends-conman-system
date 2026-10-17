'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import PricingFields from '@/components/projects/PricingFields'
import { Alert, Button, SelectField, TextField, TextareaField } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'

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
    try {
      const json = await fetchJson('/api/projects', jsonRequest('POST', data))
      router.push(`/projects/${json.data.id}/structure?new=1`) // next step: describe the building
    } catch (err) {
      setError(errorMessage(err))
      setLoading(false)
    }
  }

  return (
    <>
      <TopNav title="New Project" subtitle="Set up a new property project" />
      <div className="admin-content">
        <div className="max-w-md mx-auto">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Project Details</span>
            </div>
            {error && <Alert variant="danger" className="mb-4">{error}</Alert>}
            <form onSubmit={handleSubmit}>
              <div className="grid grid-2 gap-4 mb-4">
                <TextField label="Project Name" name="name" required placeholder="Sunrise Heights" />
                <SelectField label="Project Type" name="type" required><option value="FRESH">Fresh Sale</option><option value="REDEVELOPMENT">Redevelopment</option><option value="MIXED">Mixed</option></SelectField>
                <TextField label="RERA Number" name="reraNumber" placeholder="P52100012345" />
                <TextField label="City" name="city" required placeholder="Mumbai" />
                <TextField label="State" name="state" defaultValue="Maharashtra" />
                <SelectField label="Status" name="status"><option value="PLANNING">Planning</option><option value="UNDER_CONSTRUCTION">Under Construction</option><option value="READY">Ready</option><option value="COMPLETED">Completed</option></SelectField>
              </div>
              <TextareaField label="Project Address" wrapperClassName="mb-4" name="address" required placeholder="Plot No. 45, Survey No. 123, Andheri East..." rows={3} />
              <div className="grid grid-2 gap-4 mb-4">
                <TextField label="Launch Date" name="launchDate" type="date" />
                <TextField label="Expected Completion" name="expectedCompletion" type="date" />
              </div>
              <div className="divider" />
              <h4 className="mb-4">Company / Developer Details</h4>
              <div className="grid grid-2 gap-4 mb-4">
                <TextField label="Company Name" name="companyName" required placeholder="Your company's registered name" />
                <TextField label="GSTIN" name="companyGstin" placeholder="27AAAAA0000A1Z5" />
              </div>
              <h4 className="mt-2 mb-1">Tax and pricing</h4>
              <p className="form-hint mb-3">Defaults suit Maharashtra. Change them if this project&apos;s state or year differs; you can edit them later.</p>
              <PricingFields />
              <TextareaField label="Company Address" wrapperClassName="mb-6" name="companyAddress" required placeholder="Office No. 501, XYZ Building..." rows={3} />
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
