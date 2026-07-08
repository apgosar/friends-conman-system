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
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 24,
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: 0,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            style={{
              padding: '10px 20px',
              fontSize: '0.9rem',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id
                ? '2px solid var(--color-primary)'
                : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && overviewContent}
      {activeTab === 'building' && (
        <div className="card" style={{ padding: 20 }}>
          <BuildingViewer projectId={projectId} />
        </div>
      )}
    </>
  )
}
