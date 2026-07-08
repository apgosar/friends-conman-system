'use client'

import { useTransition } from 'react'
import { activateTemplate } from './actions'

export default function ActivateButton({ projectId, templateId, type, isActive }: { projectId: string, templateId: string, type: string, isActive: boolean }) {
  const [isPending, startTransition] = useTransition()

  if (isActive) {
    return (
      <span className="badge badge-success">
        Active
      </span>
    )
  }

  return (
    <button 
      type="button"
      className="btn btn-ghost btn-sm"
      style={{ color: 'var(--color-primary)' }}
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          activateTemplate(projectId, templateId, type)
        })
      }}
    >
      {isPending ? 'Activating...' : 'Activate'}
    </button>
  )
}
