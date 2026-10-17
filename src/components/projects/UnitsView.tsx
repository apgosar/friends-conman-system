'use client'

import { useState } from 'react'
import { Button, Card, CardHeader } from '@/components/ui'
import BuildingViewer from './BuildingViewer'

type View = '3d' | 'table'

// One BuildingViewer, two ways to look at it. Both share the same data, filters and unit panel
// (floor plan, quotes, inquiries), so nothing differs between the views except the layout.
export default function UnitsView({ projectId }: { projectId: string }) {
  const [view, setView] = useState<View>('3d')

  const toggleBtn = (v: View, label: string) => (
    <Button size="sm" variant={view === v ? 'primary' : 'secondary'} aria-pressed={view === v} onClick={() => setView(v)}>{label}</Button>
  )

  return (
    <Card className="mb-6 p-5">
      <CardHeader
        className="mb-4"
        title={view === '3d' ? '🏢 Building View' : '📋 All Units'}
        actions={
          <>
            <div role="group" aria-label="Switch view" className="segmented">
              {toggleBtn('3d', '3D View')}
              {toggleBtn('table', 'Table')}
            </div>
            <span className="text-sm text-muted">Export inquiries:</span>
            <a href={`/api/projects/${projectId}/inquiries/export?format=xlsx`} className="btn btn-secondary btn-sm">XLSX</a>
            <a href={`/api/projects/${projectId}/inquiries/export?format=csv`} className="btn btn-secondary btn-sm">CSV</a>
          </>
        }
      />
      <BuildingViewer projectId={projectId} view={view} />
    </Card>
  )
}
