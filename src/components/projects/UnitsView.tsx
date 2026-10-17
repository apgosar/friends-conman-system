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
    <div className="card mb-6 p-5">
      <div className="card-header mb-4 wrap gap-3">
        <span className="card-title">{view === '3d' ? '🏢 Building View' : '📋 All Units'}</span>
        <div className="flex gap-2 items-center wrap">
          <div role="group" aria-label="Switch view" className="inline-flex overflow-hidden" style={{ borderRadius: 8, border: '1px solid var(--border-color)' }}>
            {toggleBtn('3d', '3D View')}
            {toggleBtn('table', 'Table')}
          </div>
          <span className="text-sm text-muted">Export inquiries:</span>
          <a href={`/api/projects/${projectId}/inquiries/export?format=xlsx`} className="btn btn-secondary btn-sm">XLSX</a>
          <a href={`/api/projects/${projectId}/inquiries/export?format=csv`} className="btn btn-secondary btn-sm">CSV</a>
        </div>
      </div>
      <BuildingViewer projectId={projectId} view={view} />
    </div>
  )
}
