'use client'

import { useState, type ReactNode } from 'react'
import { Tabs } from '@/components/ui'
import BackToProject from './BackToProject'

type Tab = 'details' | 'charges' | 'interest'

/**
 * The edit project screen in tabs: the project's details, its other charges, and its interest settings. Both stay on the page (the one not
 * shown is only hidden), so what was typed in one is not lost when the other is opened.
 */
export default function EditProjectTabs({ projectId, details, charges, interest }: { projectId: string; details: ReactNode; charges: ReactNode; interest: ReactNode }) {
  const [tab, setTab] = useState<Tab>('details')
  return (
    <div className="max-w-lg mx-auto">
      <div className="flex justify-between items-center gap-3 wrap mb-4">
        <h3 className="m-0">Edit Project</h3>
        <BackToProject projectId={projectId} />
      </div>
      <Tabs<Tab>
        label="Edit project sections"
        active={tab}
        onChange={setTab}
        items={[{ id: 'details', label: 'Project details' }, { id: 'charges', label: 'Other charges' }, { id: 'interest', label: 'Interest' }]}
      />
      <div className="mt-4" hidden={tab !== 'details'}>{details}</div>
      <div className="mt-4" hidden={tab !== 'charges'}>{charges}</div>
      <div className="mt-4" hidden={tab !== 'interest'}>{interest}</div>
    </div>
  )
}
