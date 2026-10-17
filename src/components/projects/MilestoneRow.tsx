'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Alert, Button, Modal, StatusBadge, Td, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { formatDate } from '@/lib/format'

export default function MilestoneRow({ m }: { m: any }) {
  const router = useRouter()
  const toast = useToast()
  const { data: session } = useSession()
  const isSuperAdmin = session?.user?.role === 'SUPER_ADMIN'

  const [loading, setLoading] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [certificateFile, setCertificateFile] = useState<File | null>(null)

  const handleDelete = async () => {
    setLoading(true)
    try {
      await fetchJson(`/api/milestones/${m.id}`, { method: 'DELETE' })
      setShowDelete(false)
      toast.success('Milestone deleted')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!certificateFile) return toast.error('Choose the architect completion certificate')
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', certificateFile)
      const upload = await fetchJson('/api/upload', { method: 'POST', body: formData })
      await fetchJson(`/api/milestones/${m.id}/complete`, jsonRequest('POST', { architectCertificateUrl: upload.url }))
      setShowComplete(false)
      toast.success('Milestone marked complete')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <tr>
      <Td label="#" className="font-semibold">{m.sequence}</Td>
      <Td label="Milestone" className="font-medium">{m.name}</Td>
      <Td label="Status">
        <StatusBadge kind="milestone" status={m.status} />
      </Td>
      <Td label="Planned" className="text-muted">{m.plannedDate ? formatDate(m.plannedDate) : '—'}</Td>
      <Td label="Actual" className="text-muted">{m.actualDate ? formatDate(m.actualDate) : '—'}</Td>
      <Td label="">
        <div className="flex gap-2 items-center wrap">
          {m.architectCertificateUrl ? (
            <a href={m.architectCertificateUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">View certificate</a>
          ) : (
            <span className="text-muted text-sm">No certificate</span>
          )}
          {m.status !== 'COMPLETED' && <Button size="sm" onClick={() => setShowComplete(true)}>Mark Complete</Button>}
          {isSuperAdmin && <Button size="sm" variant="danger" onClick={() => setShowDelete(true)}>🗑️ Delete</Button>}
        </div>

        {showComplete && (
          <Modal
            title="Complete milestone"
            subtitle={m.name}
            dismissible={!loading}
            onClose={() => setShowComplete(false)}
            footer={
              <>
                <Button onClick={() => setShowComplete(false)} disabled={loading}>Cancel</Button>
                <Button type="submit" form="complete-milestone-form" variant="primary" loading={loading} disabled={!certificateFile}>Submit and complete</Button>
              </>
            }
          >
            <form id="complete-milestone-form" onSubmit={handleComplete} className="form-group">
              <label className="form-label" htmlFor="certificate-file">Architect completion certificate (PDF or image)<span className="form-required" aria-hidden="true">*</span></label>
              <input id="certificate-file" type="file" required accept=".pdf,image/*" className="form-input" onChange={(e) => setCertificateFile(e.target.files?.[0] ?? null)} />
              <span className="form-hint">Upload the signed completion certificate from the architect.</span>
            </form>
          </Modal>
        )}

        {showDelete && (
          <Modal
            title="Delete milestone"
            subtitle={m.name}
            dismissible={!loading}
            onClose={() => setShowDelete(false)}
            footer={
              <>
                <Button onClick={() => setShowDelete(false)} disabled={loading}>Cancel</Button>
                <Button variant="danger" loading={loading} onClick={handleDelete}>Delete milestone</Button>
              </>
            }
          >
            <p className="mb-4">Delete this milestone?</p>
            <Alert variant="warning">
              This also deletes all <strong>pending payment schedules (demand letters)</strong> generated for this milestone across all sales. If payments have already been recorded against them, the delete is blocked to keep the financial records intact.
            </Alert>
          </Modal>
        )}
      </Td>
    </tr>
  )
}
