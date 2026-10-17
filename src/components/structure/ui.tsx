'use client'

import { Input, PhoneField } from '@/components/ui'
import { PHONE_ERROR, normalizePhone } from '@/lib/phone'
import { formatNumber } from '@/lib/format'

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

/** A number for a table cell, or an em dash when there is none. */
export const fmtNum = (n: number | null | undefined) => (n === null || n === undefined ? '—' : formatNumber(n))

/** Name (required) and mobile (optional) of the person who booked a unit. */
export function BookerFields({ name, mobile, onName, onMobile }: { name: string; mobile: string; onName: (v: string) => void; onMobile: (v: string) => void }) {
  return (
    <div className="form-grid mb-3">
      <div className="form-group">
        <label className="form-label" htmlFor="booker-name">Booked by (name)<span className="form-required" aria-hidden="true">*</span></label>
        <Input id="booker-name" required maxLength={100} value={name} onChange={(e) => onName(e.target.value)} />
      </div>
      <PhoneField id="booker-mobile" label="Mobile (optional)" value={mobile} error={normalizePhone(mobile).ok ? undefined : PHONE_ERROR} onValueChange={onMobile} />
    </div>
  )
}
