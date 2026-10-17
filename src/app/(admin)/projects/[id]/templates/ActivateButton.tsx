'use client'

import { useTransition } from 'react'
import { activateTemplate } from './actions'
import { Button } from '@/components/ui'

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
    <Button 
      type="button"
      className="text-brand" variant="ghost" size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          activateTemplate(projectId, templateId, type)
        })
      }}
    >
      {isPending ? 'Activating...' : 'Activate'}
    </Button>
  )
}
