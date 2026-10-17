'use client'

import { useState } from 'react'
import BuildingViewer from '@/components/projects/BuildingViewer'

interface Props {
  projectId: string
  overviewContent: React.ReactNode
}

const TABS = [
  { id: 'overview', label: '📋 Overview' },
  { id: 'building', label: '🏢 Building View' },
]

export default function ProjectTabs({ projectId, overviewContent }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'building'>('overview')

  return (
    <>
      {/* Tab bar */}
      <div
        className="flex gap-1 mb-6 pb-0" style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className="font-semibold cursor-pointer" style={{ padding: '10px 20px', fontSize: '0.9rem', background: 'none', border: 'none', borderBottom: activeTab === tab.id
                ? '2px solid var(--color-primary)'
                : '2px solid transparent', color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--text-muted)', transition: 'all 150ms ease', marginBottom: -1 }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && overviewContent}
      {activeTab === 'building' && (
        <div className="card p-5">
          <BuildingViewer projectId={projectId} />
        </div>
      )}
    </>
  )
}
