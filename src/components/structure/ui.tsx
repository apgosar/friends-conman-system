'use client'

import type { CSSProperties, ReactNode } from 'react'

export interface UnitTypeRow {
  id: string
  category: 'FLAT' | 'SHOP' | 'OFFICE' | 'COMMON'
  name: string
  configuration: string
  carpetAreaSqft: number
  builtupAreaSqft: number | null
  basePricePerSqft: number | null
  floorPlanUrl: string | null
  unitCount: number
}

export interface StructureUnit {
  id: string
  category: string
  unitNumber: string
  wingId: string
  wingName: string
  floorNumber: number
  unitTypeId: string | null
  typeName: string | null
  configuration: string
  carpetAreaSqft: number
  builtupAreaSqft: number | null
  basePricePerSqft: number | null
  status: string
  statusManual: boolean
  hasSale: boolean
  inquiryCount: number
}

export interface WingRow { id: string; name: string; floors: number; units: number }

export const inputStyle: CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
  background: 'var(--bg-surface)', outline: 'none', fontSize: '0.875rem', color: 'var(--text-primary)', boxSizing: 'border-box',
}
export const labelStyle: CSSProperties = { display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }
export const sectionTitle: CSSProperties = { fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }

/** fetch that turns an error response into a thrown Error carrying the server's message. */
export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err: any = new Error(json.error || 'Something went wrong')
    err.errors = json.errors
    err.totalErrors = json.totalErrors
    throw err
  }
  return json
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const fmtNum = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-IN'))

export function Modal({ title, subtitle, onClose, children, maxWidth = 520 }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; maxWidth?: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--bg-card)', width: '100%', maxWidth, maxHeight: '92vh', overflowY: 'auto', borderRadius: 12, boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>{title}</h3>
            {subtitle && <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  )
}
