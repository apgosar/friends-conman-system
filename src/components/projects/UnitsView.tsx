'use client'

import { useState } from 'react'
import BuildingViewer from './BuildingViewer'

type View = '3d' | 'table'

// One BuildingViewer, two ways to look at it. Both share the same data, filters and unit panel
// (floor plan, quotes, inquiries), so nothing differs between the views except the layout.
export default function UnitsView({ projectId }: { projectId: string }) {
  const [view, setView] = useState<View>('3d')

  const toggleBtn = (v: View, label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={`btn btn-sm ${view === v ? 'btn-primary' : 'btn-secondary'}`}
      style={{ borderRadius: 0 }}
    >
      {label}
    </button>
  )

  return (
    <div className="card mb-6" style={{ padding: 20 }}>
      <div className="card-header" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <span className="card-title">{view === '3d' ? '🏢 Building View' : '📋 All Units'}</span>
        <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
          <div role="group" aria-label="Switch view" style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            {toggleBtn('3d', '3D View')}
            {toggleBtn('table', 'Table')}
          </div>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Export inquiries:</span>
          <a href={`/api/projects/${projectId}/inquiries/export?format=xlsx`} className="btn btn-secondary btn-sm">XLSX</a>
          <a href={`/api/projects/${projectId}/inquiries/export?format=csv`} className="btn btn-secondary btn-sm">CSV</a>
        </div>
      </div>
      <BuildingViewer projectId={projectId} view={view} />
    </div>
  )
}
