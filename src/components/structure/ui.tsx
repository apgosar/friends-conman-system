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
  bookedByName: string | null
  bookedByMobile: string | null
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

/** Name (required) and mobile (optional) of the person who booked a unit. */
export function BookerFields({ name, mobile, onName, onMobile }: { name: string; mobile: string; onName: (v: string) => void; onMobile: (v: string) => void }) {
  return (
    <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div><label style={labelStyle}>Booked by (name) *</label><input required maxLength={100} style={inputStyle} value={name} onChange={(e) => onName(e.target.value)} /></div>
      <div><label style={labelStyle}>Mobile (optional)</label><input type="tel" inputMode="numeric" maxLength={14} placeholder="10 digits" style={inputStyle} value={mobile} onChange={(e) => onMobile(e.target.value)} /></div>
    </div>
  )
}

export function Modal({ title, subtitle, onClose, children, maxWidth = 520 }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; maxWidth?: number }) {
  return (
    <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 1100 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div className="relative w-full" style={{ background: 'var(--bg-card)', maxWidth, maxHeight: '92vh', overflowY: 'auto', borderRadius: 12, boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)' }}>
        <div className="flex justify-between items-center" style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
          <div>
            <h3 className="text-lg font-semibold m-0 text-primary">{title}</h3>
            {subtitle && <p className="text-sm text-muted" style={{ margin: '4px 0 0' }}>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted cursor-pointer" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, fontSize: '1.2rem' }}>×</button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  )
}
