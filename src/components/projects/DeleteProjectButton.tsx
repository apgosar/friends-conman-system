'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Modal, TextField, useConfirm, useToast } from '@/components/ui'
import { errorMessage, fetchJson } from '@/lib/client/api'

/**
 * Super Admin only. Deletes the project for good, with its building, plans, charges, templates and quotes and, if it has
 * any, every sale with its payments, documents and messages. A project with sales asks for its name to be typed first.
 */
export default function DeleteProjectButton({ projectId, projectName, salesCount }: { projectId: string; projectName: string; salesCount: number }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [asking, setAsking] = useState(false)
  const [typed, setTyped] = useState('')

  const remove = async () => {
    setLoading(true)
    try {
      await fetchJson(`/api/projects/${projectId}`, { method: 'DELETE' })
      toast.success('Project deleted')
      router.push('/projects')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
      setLoading(false)
      setAsking(false)
    }
  }

  const start = async () => {
    if (salesCount > 0) { setTyped(''); setAsking(true); return }
    const ok = await confirm({
      title: `Delete ${projectName}?`,
      message: 'The project is deleted for good, with its wings, floors and units, unit types, milestones, payment plans, other charges, templates, tenants and quotes. This cannot be undone.',
      confirmLabel: 'Delete project',
      danger: true,
    })
    if (ok) await remove()
  }

  return (
    <>
      <Button variant="danger" loading={loading} onClick={start}>🗑 Delete Project</Button>
      {asking && (
        <Modal
          title={`Delete ${projectName}?`}
          dismissible={!loading}
          onClose={() => setAsking(false)}
          footer={
            <>
              <Button onClick={() => setAsking(false)} disabled={loading}>Cancel</Button>
              <Button variant="danger" loading={loading} disabled={typed.trim() !== projectName} onClick={remove}>Delete project and its sales</Button>
            </>
          }
        >
          <div className="flex dir-col gap-4">
            <Alert variant="danger" title={`This also deletes ${salesCount === 1 ? 'its 1 sale' : `its ${salesCount} sales`}`}>
              Every sale of this project goes with it, including cancelled ones: the buyers, payment schedules, payments and receipts, interest, documents, loans and the messages sent. The project&apos;s building, plans, charges, templates, tenants and quotes go too. Stored agreements and files are removed as well. This cannot be undone.
            </Alert>
            <TextField label={`Type the project name to confirm: ${projectName}`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        </Modal>
      )}
    </>
  )
}
