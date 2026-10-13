'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteTemplateButton({ projectId, templateId, isActive = false }: { projectId: string; templateId: string; isActive?: boolean }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleDelete = () => {
    if (!confirm('Delete this template? This cannot be undone.')) return
    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}/templates/${templateId}`, { method: 'DELETE' })
      if (res.ok) {
        router.refresh()
      } else {
        const json = await res.json().catch(() => ({}))
        alert(json.error || 'Failed to delete template')
      }
    })
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      style={{ color: 'var(--color-danger, #ef4444)', ...(isActive ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
      disabled={isPending || isActive}
      title={isActive ? 'This template is active. Activate another version first, then delete this one.' : undefined}
      onClick={handleDelete}
    >
      {isPending ? '...' : 'Delete'}
    </button>
  )
}
