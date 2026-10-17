'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useConfirm, useToast } from '@/components/ui'
import { errorMessage, fetchJson } from '@/lib/client/api'

export default function DeleteTemplateButton({ projectId, templateId, isActive = false }: { projectId: string; templateId: string; isActive?: boolean }) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()

  const handleDelete = async () => {
    const ok = await confirm({ title: 'Delete this template?', message: 'This cannot be undone.', confirmLabel: 'Delete template', danger: true })
    if (!ok) return
    setBusy(true)
    try {
      await fetchJson(`/api/projects/${projectId}/templates/${templateId}`, { method: 'DELETE' })
      toast.success('Template deleted')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant="danger"
      size="sm"
      loading={busy}
      disabled={isActive}
      title={isActive ? 'This template is active. Activate another version first, then delete this one.' : undefined}
      onClick={handleDelete}
    >
      Delete
    </Button>
  )
}
