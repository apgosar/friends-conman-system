'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteTemplateButton({ projectId, templateId }: { projectId: string; templateId: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleDelete = () => {
    if (!confirm('Delete this template? This cannot be undone.')) return
    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}/templates/${templateId}`, { method: 'DELETE' })
      if (res.ok) {
        router.refresh()
      } else {
        alert('Failed to delete template')
      }
    })
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      style={{ color: 'var(--color-danger, #ef4444)' }}
      disabled={isPending}
      onClick={handleDelete}
    >
      {isPending ? '...' : 'Delete'}
    </button>
  )
}
