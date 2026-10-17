'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_PRICING, GST_RATE_OPTIONS, computeCharges, gstOn, type PricingConfig } from '@/lib/pricing'
import { percentOf, round2 } from '@/lib/money'
import { PHONE_ERROR, normalizePhone } from '@/lib/phone'
import { wingLabel } from '@/lib/building-structure'
import { scrollToFirstInvalid } from '@/lib/client/forms'

// Tax and pricing rules come from the selected project's settings (see lib/pricing.ts)

function fmt(n: number) {
  return formatCurrency(n, 0)
}

// ─── Validation helpers ──────────────────────────────────────
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validatePan(pan: string) {
  if (!pan) return ''
  return PAN_REGEX.test(pan.toUpperCase()) ? '' : 'Please enter valid PAN number'
}
function validateAadhaar(aadhaar: string) {
  const digits = aadhaar.replace(/\s/g, '')
  if (!digits) return ''
  return digits.length === 12 && /^\d{12}$/.test(digits) ? '' : 'Please enter valid Aadhar number'
}
function validateEmail(email: string) {
  if (!email) return ''
  return EMAIL_REGEX.test(email) ? '' : 'Please enter a valid email address'
}
function validatePhone(phone: string) {
  return normalizePhone(phone).ok ? '' : PHONE_ERROR
}
function formatAadhaar(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 12)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

type ParkingSlot = { podium: string; floor: string; number: string }
type Buyer = { fullName: string; panNumber: string; aadhaarNumber: string; address: string; email: string; whatsappNumber: string }
// principalAmount already includes stamp duty + registration for the plinth row
type ScheduleRow = { milestoneId: string; description: string; principalAmount: number; gstAmount: number; isPlinth?: boolean; sequence: number; percentOfAV?: number }

const emptyBuyer = (): Buyer => ({ fullName: '', panNumber: '', aadhaarNumber: '', address: '', email: '', whatsappNumber: '' })

// ─── Step indicator ──────────────────────────────────────────
import { Alert, Button, Input, PhoneField, SelectField, StepBar, Stepper, Table, TextField, TextareaField } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { formatCurrency } from '@/lib/format'

// ─── Main Wizard ─────────────────────────────────────────────
// The project's units grouped by wing (A, B ... then the commercial block), each wing's units in natural order
const unitsGroupedByWing = (units: any[]): [string, any[]][] => {
  const byWing = new Map<string, any[]>()
  for (const u of units) byWing.set(u.wingName, [...(byWing.get(u.wingName) ?? []), u])
  const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  return [...byWing.entries()]
    .sort(([a], [b]) => natural(a, b))
    .map(([wing, list]) => [wing, [...list].sort((x, y) => natural(x.unitNumber, y.unitNumber))])
}

// One value per parking space, written once each: "P-45, P-46"
const joinSlots = (slots: ParkingSlot[], field: keyof ParkingSlot) => Array.from(new Set(slots.map(p => p[field].trim()).filter(Boolean))).join(', ') || undefined

type Prefill = { inquiryId: string; projectId: string; unitId: string; agreementValue: number; carParking: boolean; buyerName: string; mobileNumber: string } | null

export default function NewSaleWizard({ projects, prefill = null }: { projects: any[]; prefill?: Prefill }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  // Field-level errors from the Review step, keyed by field (project, unit, tenant, buyer-0-name ...). Each clears when its field is edited.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const clearFieldError = (key: string) => setFieldErrors(prev => (key in prev ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)) : prev))

  // Step 1 state
  const [projectId, setProjectId] = useState(prefill?.projectId ?? '')
  const selectedProject = projects.find(p => p.id === projectId)
  const unitsByWing = unitsGroupedByWing(selectedProject?.units ?? [])
  const prefillProjectType = projects.find(p => p.id === prefill?.projectId)?.type
  const [saleType, setSaleType] = useState(prefillProjectType && prefillProjectType !== 'MIXED' ? prefillProjectType : 'FRESH')
  const [unitId, setUnitId] = useState(prefill?.unitId ?? '')
  const [tenantId, setTenantId] = useState('')
  const [agreementValue, setAgreementValue] = useState(prefill?.agreementValue ?? 10000000)
  const [bookingAmount, setBookingAmount] = useState<number | ''>('')
  // Car parking: how many, whether it is inside the agreement value, and where each one is
  const emptySlot = (): ParkingSlot => ({ podium: '', floor: '', number: '' })
  const [parkingSlots, setParkingSlots] = useState<ParkingSlot[]>(prefill?.carParking ? [emptySlot()] : [])
  const carParkingCount = parkingSlots.length
  const parkingIncluded: boolean = selectedProject?.carParkingIncluded ?? false // a project setting
  const carParking = carParkingCount > 0
  const setParkingCount = (n: number) => setParkingSlots(prev => (n <= prev.length ? prev.slice(0, n) : [...prev, ...Array.from({ length: n - prev.length }, emptySlot)]))
  const updateSlot = (i: number, field: keyof ParkingSlot, value: string) => setParkingSlots(prev => prev.map((p, k) => (k === i ? { ...p, [field]: value } : p)))
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0])
  const [buyers, setBuyers] = useState<Buyer[]>([prefill ? { ...emptyBuyer(), fullName: prefill.buyerName, whatsappNumber: prefill.mobileNumber } : emptyBuyer()])

  // Derived financials. GST is chosen here (0 / 5 / 12) and starts at the project's rate; stamp duty starts at the project's %
  // but can be typed as a rupee amount (then the % is worked out) or as a %
  const projectPricing: PricingConfig = selectedProject?.pricing ?? DEFAULT_PRICING
  const defaultGstRate = (GST_RATE_OPTIONS as readonly number[]).includes(projectPricing.gstRatePercent) ? projectPricing.gstRatePercent : 5
  const [gstRateChoice, setGstRateChoice] = useState<number | null>(null)
  const gstRate = gstRateChoice ?? defaultGstRate
  const [stampPctInput, setStampPctInput] = useState<number | '' | null>(null) // null = the project's %
  const [stampAmtInput, setStampAmtInput] = useState<number | '' | null>(null) // set when a rupee amount was typed
  const pricing: PricingConfig = { ...projectPricing, gstRatePercent: gstRate }
  // Parking inside the agreement value adds no parking charge and no extra registration fee
  const separateParking = carParking && !parkingIncluded
  const { gst, registration: regCharges } = computeCharges(pricing, agreementValue, separateParking)
  const stampPct = stampAmtInput !== null
    ? (agreementValue > 0 ? round2(((Number(stampAmtInput) || 0) / agreementValue) * 100) : 0)
    : stampPctInput !== null ? Number(stampPctInput) || 0 : pricing.stampDutyPercent
  const stampDuty = stampAmtInput !== null ? Number(stampAmtInput) || 0 : percentOf(agreementValue, stampPct)
  const parkingCost = separateParking ? (selectedProject?.carParkingCharges ?? 0) * carParkingCount : 0

  // Step 2 state — editable payment schedule
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])

  // Step 3 state
  const [createdSaleId, setCreatedSaleId] = useState('')
  const [generatedDoc, setGeneratedDoc] = useState<any>(null)
  const [generating, setGenerating] = useState(false)

  // ── Buyer helpers ────────────────────────────────────────
  const [extractingKyc, setExtractingKyc] = useState<string | null>(null)
  const [kycMessage, setKycMessage] = useState<{ type: 'success' | 'error', text: string, idx: number } | null>(null)

  const handleKycUpload = async (idx: number, docType: 'PAN' | 'AADHAAR', file: File) => {
    if (!file) return
    setExtractingKyc(`${idx}-${docType}`)
    setKycMessage(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('docType', docType)
      const json = await fetchJson('/api/extract-kyc', { method: 'POST', body: formData })
      const { fullName, panNumber, aadhaarNumber, address } = json.data
      setBuyers(prev => prev.map((b, i) => {
        if (i !== idx) return b
        return {
          ...b,
          fullName: fullName || b.fullName,
          panNumber: panNumber || b.panNumber,
          aadhaarNumber: aadhaarNumber ? formatAadhaar(aadhaarNumber) : b.aadhaarNumber,
          address: address || b.address,
        }
      }))
      setKycMessage({ type: 'success', text: `Successfully extracted ${docType} details!`, idx })
    } catch (err) {
      setKycMessage({ type: 'error', text: errorMessage(err), idx })
    } finally {
      setExtractingKyc(null)
      setTimeout(() => setKycMessage(null), 6000)
    }
  }

  const updateBuyer = (idx: number, field: keyof Buyer, val: string) => {
    clearFieldError(`buyer-${idx}-${field}`)
    setBuyers(prev => prev.map((b, i) => i === idx ? { ...b, [field]: val } : b))
  }
  const addBuyer = () => setBuyers(prev => [...prev, emptyBuyer()])
  const removeBuyer = (idx: number) => setBuyers(prev => prev.filter((_, i) => i !== idx))

  // ── Step 1 → 2: Build payment schedule from project milestones ──
  const goToStep2 = () => {
    setError('')
    // Check everything at once, mark each wrong field red under its own message, and scroll to the first one
    const errs: Record<string, string> = {}
    if (!projectId) errs.project = 'Please select a project'
    if (!unitId) errs.unit = 'Please select a unit'
    if (saleType === 'REDEVELOPMENT' && !tenantId) errs.tenant = 'Please link a tenant'
    buyers.forEach((b, i) => {
      if (!b.fullName.trim()) errs[`buyer-${i}-fullName`] = 'Please enter full name'
      if (validatePan(b.panNumber) || !b.panNumber) errs[`buyer-${i}-panNumber`] = 'Please enter valid PAN number'
      if (validateAadhaar(b.aadhaarNumber)) errs[`buyer-${i}-aadhaarNumber`] = 'Please enter valid Aadhar number'
      if (validateEmail(b.email)) errs[`buyer-${i}-email`] = 'Please enter a valid email address'
      if (validatePhone(b.whatsappNumber)) errs[`buyer-${i}-whatsappNumber`] = PHONE_ERROR
    })
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) { scrollToFirstInvalid(); return }

    const milestones = selectedProject?.milestones ?? []

    // Find the possession milestone for car parking
    const possessionMilestone = milestones.find((m: any) =>
      m.name.toLowerCase().includes('possession')
    )

    const completedMilestones = milestones.filter((m: any) => m.status === 'COMPLETED')
    const latestCompleted = completedMilestones.length > 1 ? completedMilestones[completedMilestones.length - 1] : null

    let spillOverCredit = 0
    const rows: ScheduleRow[] = []

    milestones.forEach((m: any, index: number) => {
      const isPlinth = m.name.toLowerCase().includes('plinth') && m.percentOfAV > 0
      
      let shouldKeep = false
      let basePrincipal = 0

      if (index === 0) {
        shouldKeep = true
        basePrincipal = (bookingAmount !== '' && Number(bookingAmount) > 0) ? Number(bookingAmount) : Math.round(agreementValue * (m.percentOfAV / 100))
        const originalFirst = Math.round(agreementValue * (m.percentOfAV / 100))
        spillOverCredit = originalFirst - basePrincipal
      } else if (latestCompleted && m.id === latestCompleted.id) {
        shouldKeep = true
        const totalCompletedPercent = completedMilestones.reduce((acc: number, curr: any) => acc + (curr.percentOfAV || 0), 0)
        let targetPrincipal = Math.round(agreementValue * (totalCompletedPercent / 100))
        const actualBooking = (bookingAmount !== '' && Number(bookingAmount) > 0) ? Number(bookingAmount) : Math.round(agreementValue * (milestones[0].percentOfAV / 100))
        
        targetPrincipal -= actualBooking
        
        if (targetPrincipal < 0) {
          basePrincipal = 0
          spillOverCredit = targetPrincipal
        } else {
          basePrincipal = targetPrincipal
          spillOverCredit = 0
        }
      } else if (m.status === 'COMPLETED' && latestCompleted) {
        shouldKeep = false
      } else if (m.percentOfAV > 0) {
        shouldKeep = true
        basePrincipal = Math.round(agreementValue * (m.percentOfAV / 100))
        
        if (spillOverCredit !== 0) {
          basePrincipal += spillOverCredit
          if (basePrincipal < 0) {
            spillOverCredit = basePrincipal
            basePrincipal = 0
          } else {
            spillOverCredit = 0
          }
        }
      }

      if (shouldKeep && (basePrincipal > 0 || index === 0)) {
        const pct = Number(((basePrincipal / agreementValue) * 100).toFixed(2))
        const gstAmt = gstOn(pricing, basePrincipal)
        rows.push({
          milestoneId: m.id,
          description: m.name,
          principalAmount: basePrincipal,
          gstAmount: gstAmt,
          isPlinth: false,
          sequence: m.sequence,
          percentOfAV: pct,
        })
      }

      if (isPlinth && (stampDuty > 0 || regCharges > 0)) {
        rows.push({
          milestoneId: m.id,
          description: 'Stamp Duty and Registration',
          principalAmount: stampDuty + regCharges,
          gstAmount: 0,
          isPlinth: true,
          sequence: m.sequence,
        })
      }
    })

    // Add car parking as a separate row if it is charged separately — NO GST on parking
    if (separateParking && parkingCost > 0) {
      rows.push({
        milestoneId: possessionMilestone?.id || '',
        description: carParkingCount > 1 ? `Car Parking (${carParkingCount} spaces)` : 'Car Parking',
        principalAmount: parkingCost,
        gstAmount: 0,
        sequence: 999,
      })
    }

    setSchedules(rows)
    setStep(2)
  }

  // ── Step 2 schedule editing ──────────────────────────────
  const updateScheduleAmount = (idx: number, newAmt: number) => {
    setSchedules(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const newGst = r.percentOfAV !== undefined ? gstOn(pricing, newAmt) : 0
      const newPct = r.percentOfAV !== undefined ? Number(((newAmt / agreementValue) * 100).toFixed(2)) : undefined
      return { ...r, principalAmount: newAmt, gstAmount: newGst, percentOfAV: newPct }
    }))
  }

  const updateSchedulePercent = (idx: number, newPct: number) => {
    setSchedules(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const newAmt = Math.round((newPct / 100) * agreementValue)
      const newGst = r.percentOfAV !== undefined ? gstOn(pricing, newAmt) : 0
      return { ...r, principalAmount: newAmt, gstAmount: newGst, percentOfAV: newPct }
    }))
  }

  // ── Step 2 → create sale + schedules ────────────────────
  const goToStep3 = async () => {
    setError('')
    setGenerating(true)
    try {
      const payload = {
        projectId,
        unitId,
        tenantId: saleType === 'REDEVELOPMENT' ? tenantId : undefined,
        saleType,
        agreementValue,
        gstRatePercent: gstRate,
        gstAmount: gst,
        stampDuty,
        registrationCharges: regCharges,
        carParking,
        carParkingCount,
        carParkingCharges: parkingCost,
        parkingPodiumLevel: joinSlots(parkingSlots, 'podium'),
        parkingFloor: joinSlots(parkingSlots, 'floor'),
        parkingNumber: joinSlots(parkingSlots, 'number'),
        bookingAmount: bookingAmount !== '' ? Number(bookingAmount) : undefined,
        bookingDate,
        inquiryId: prefill?.inquiryId,
        buyers: buyers.map((b, i) => ({ ...b, whatsappNumber: normalizePhone(b.whatsappNumber).ok ? (normalizePhone(b.whatsappNumber) as { value: string | null }).value ?? '' : '', isPrimary: i === 0, sequence: i + 1 })),
        paymentSchedules: schedules.filter(s => s.principalAmount > 0).map(s => ({
          milestoneId: s.milestoneId || undefined,
          description: s.description,
          principalAmount: s.principalAmount,  // already includes stamp duty + reg for plinth row
          gstAmount: s.gstAmount,
        }))
      }
      const data = await fetchJson('/api/sales', jsonRequest('POST', payload))
      setCreatedSaleId(data.data.id)
      setStep(3)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  // ── Step 3: Generate agreement ───────────────────────────
  const generateAgreement = async () => {
    setGenerating(true)
    setError('')
    try {
      const docType = saleType === 'FRESH' ? 'SALE_AGREEMENT' : 'PAAA'
      const data = await fetchJson('/api/documents/generate', jsonRequest('POST', { saleId: createdSaleId, type: docType }))
      setGeneratedDoc(data.data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  // ── Totals for step 2 ────────────────────────────────────
  const totalPrincipal = schedules.reduce((s, r) => s + r.principalAmount, 0)
  const totalGst = schedules.reduce((s, r) => s + r.gstAmount, 0)
  const grandTotal = totalPrincipal + totalGst

  const totalPercent = Number(schedules.reduce((s, r) => s + (r.percentOfAV || 0), 0).toFixed(2))
  const totalMilestoneAmount = schedules.reduce((s, r) => s + (r.percentOfAV !== undefined ? r.principalAmount : 0), 0)
  const isValidPlan = totalPercent === 100 && totalMilestoneAmount === agreementValue

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto form-floating">
      <StepBar step={step} steps={['Sale Details', 'Payment Plan', 'Agreement']} />

      {/* ══════════════ STEP 1 ══════════════ */}
      {step === 1 && (
        <div className="card">
          {error && <Alert variant="danger" className="mb-4">{error}</Alert>}

          {/* Unit Details */}
          <h4 className="mb-5">Unit Details</h4>
          <div className="grid grid-2 gap-4 mb-4">
            <SelectField label="Project" value={projectId} required error={fieldErrors.project} onChange={e => {
 clearFieldError('project')
 setProjectId(e.target.value)
 setUnitId('')
 const proj = projects.find(p => p.id === e.target.value)
 if (proj) setSaleType(proj.type === 'MIXED' ? 'FRESH' : proj.type)
 setParkingSlots([])
 setGstRateChoice(null)
 setStampPctInput(null)
 setStampAmtInput(null)
 }}><option value="">Select project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectField>
            <SelectField label="Sale Type" required hint={selectedProject ? undefined : 'Select project first'} value={saleType} onChange={e => setSaleType(e.target.value)} disabled={!selectedProject || selectedProject.type !== 'MIXED'}><option value="FRESH">Fresh Sale</option><option value="REDEVELOPMENT">Redevelopment (PAAA)</option></SelectField>
            <div className="form-group">
              <SelectField label="Unit" value={unitId} required hint={selectedProject ? undefined : 'Select project first'} error={fieldErrors.unit} disabled={!selectedProject} onChange={e => { clearFieldError('unit'); setUnitId(e.target.value) }}>
                <option value="">Select unit</option>
                {/* Grouped by wing (the unit number already says which wing), in natural order: B-601, B-602 ... B-1001 */}
                {unitsByWing.map(([wingName, wingUnits]) => (
                  <optgroup key={wingName} label={wingLabel(wingName)}>
                    {wingUnits.map((u: any) => <option key={u.id} value={u.id}>{u.unitNumber} ({u.configuration})</option>)}
                  </optgroup>
                ))}
              </SelectField>
              {unitId && (() => {
                const selectedUnit = selectedProject?.units.find((u: any) => u.id === unitId)
                return selectedUnit ? (
                  <div className="text-muted flex gap-3 text-sm mt-2">
                    <span>📐 Carpet Area: <strong>{selectedUnit.carpetAreaSqft} sqft</strong></span>
                    <span>(<strong>{(selectedUnit.carpetAreaSqft * 0.092903).toFixed(2)} sqm</strong>)</span>
                  </div>
                ) : null
              })()}
            </div>
            {saleType === 'REDEVELOPMENT' && (
              <SelectField label="Link Tenant" value={tenantId} error={fieldErrors.tenant} onChange={e => { clearFieldError('tenant'); setTenantId(e.target.value) }} required><option value="">Select tenant</option>{selectedProject?.tenants.map((t: any) => (
 <option key={t.id} value={t.id}>{t.name} (Old: {t.oldFlatNumber})</option>
 ))}</SelectField>
            )}
          </div>

          <div className="divider" />

          {/* Buyers */}
          <div className="flex justify-between items-center mb-3">
            <h4 className="m-0">Buyer Details</h4>
            <Button type="button" variant="ghost" size="sm" onClick={addBuyer}>+ Add Co-owner</Button>
          </div>
          {buyers.map((buyer, idx) => (
            <div key={idx} className="panel mb-4 relative">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold text-base text-secondary">
                  {idx === 0 ? '👤 Primary Buyer' : `👤 Co-owner ${idx + 1}`}
                </span>
                {idx > 0 && (
                  <Button variant="danger" size="sm" onClick={() => removeBuyer(idx)}>
                    Remove
                  </Button>
                )}
              </div>

              {/* KYC Auto-fill Section */}
              <div className="flex gap-3 mb-4 p-3 items-center wrap card-flat">
                <span className="text-base font-medium text-secondary flex items-center gap-2">
                  ✨ Auto-fill via KYC
                  {extractingKyc?.startsWith(`${idx}-`) && <span className="text-brand"> (Extracting...)</span>}
                </span>
                <label className="btn btn-ghost btn-sm file-btn">
                  Upload PAN
                  <input type="file" hidden accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleKycUpload(idx, 'PAN', file)
                    e.target.value = '' // reset
                  }} />
                </label>
                <label className="btn btn-ghost btn-sm file-btn">
                  Upload Aadhaar
                  <input type="file" hidden accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleKycUpload(idx, 'AADHAAR', file)
                    e.target.value = '' // reset
                  }} />
                </label>
                {kycMessage?.idx === idx && (
                  <div className={`w-full mt-1 text-sm ${kycMessage.type === 'success' ? 'text-success' : 'text-danger'}`} role={kycMessage.type === 'success' ? 'status' : 'alert'}>
                    {kycMessage.type === 'success' ? '✅ ' : '❌ '} {kycMessage.text}
                  </div>
                )}
              </div>

              <div className="grid grid-2 gap-4 mb-3">
                <TextField label="Full Name" value={buyer.fullName} required error={fieldErrors[`buyer-${idx}-fullName`]} onChange={e => updateBuyer(idx, 'fullName', e.target.value)} placeholder="John Doe" />
                <TextField
                  label="PAN number"
                  required
                  value={buyer.panNumber}
                  onChange={e => updateBuyer(idx, 'panNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  autoCapitalize="characters"
                  error={fieldErrors[`buyer-${idx}-panNumber`] ?? (buyer.panNumber ? validatePan(buyer.panNumber) || undefined : undefined)}
                />
                <TextField
                  label="Aadhaar number"
                  value={buyer.aadhaarNumber}
                  onChange={e => updateBuyer(idx, 'aadhaarNumber', formatAadhaar(e.target.value))}
                  placeholder="XXXX XXXX XXXX"
                  maxLength={14}
                  inputMode="numeric"
                  error={fieldErrors[`buyer-${idx}-aadhaarNumber`] ?? (buyer.aadhaarNumber ? validateAadhaar(buyer.aadhaarNumber) || undefined : undefined)}
                />
                <TextField
                  label="Email"
                  type="email"
                  value={buyer.email}
                  onChange={e => updateBuyer(idx, 'email', e.target.value)}
                  placeholder="john@example.com"
                  error={fieldErrors[`buyer-${idx}-email`] ?? (buyer.email ? validateEmail(buyer.email) || undefined : undefined)}
                />
                <PhoneField label="WhatsApp" value={buyer.whatsappNumber} onValueChange={v => updateBuyer(idx, 'whatsappNumber', v)} error={fieldErrors[`buyer-${idx}-whatsappNumber`] ?? (validatePhone(buyer.whatsappNumber) || undefined)} />
              </div>
              <TextareaField label="Address" rows={2} value={buyer.address} onChange={e => updateBuyer(idx, 'address', e.target.value)} />
            </div>
          ))}

          <div className="divider" />

          {/* Financials */}
          <h4 className="mb-5">Financials</h4>
          <div className="grid grid-2 gap-4 mb-4">
            <TextField label="Agreement Value (₹)" required type="number" min={100000} step={1000} value={agreementValue} onChange={e => setAgreementValue(Number(e.target.value))} />
            <SelectField label="GST" value={String(gstRate)} onChange={e => setGstRateChoice(Number(e.target.value))}>
              {GST_RATE_OPTIONS.map(r => <option key={r} value={r}>{r}%</option>)}
            </SelectField>
            <TextField
              label="Stamp Duty (₹)"
              type="number"
              min={0}
              value={stampAmtInput !== null ? stampAmtInput : stampDuty}
              onChange={e => setStampAmtInput(e.target.value === '' ? '' : Number(e.target.value))}
            />
            <TextField
              label="Stamp Duty (%)"
              type="number"
              min={0}
              step={0.01}
              value={stampAmtInput !== null ? stampPct : (stampPctInput !== null ? stampPctInput : stampPct)}
              onChange={e => { setStampAmtInput(null); setStampPctInput(e.target.value === '' ? '' : Number(e.target.value)) }}
            />
            <TextField label="Booking Amount (₹)" type="number" placeholder="Leave blank to use default %" value={bookingAmount} onChange={e => setBookingAmount(e.target.value ? Number(e.target.value) : '')} />
            <TextField label="Booking Date" required type="date" value={bookingDate} onChange={e => setBookingDate(e.target.value)} />
          </div>
          <p className="text-sm text-muted mb-5">Stamp duty starts at the project rate. Type an amount and the % updates, or type a %.</p>

          {/* Car parking */}
          <h4 className="mb-5">Car Parking</h4>
          <div className="mb-4">
            <Stepper label="Number of car parkings" value={carParkingCount} onChange={setParkingCount} max={10} disabled={!selectedProject} hint={selectedProject ? undefined : 'Select project first'} />
          </div>
          {carParking && (
            <div className="mb-5">
              {separateParking && selectedProject && (
                <p className="mb-3 text-base text-muted">
                  {carParkingCount} × <strong>{fmt(selectedProject.carParkingCharges)}</strong> = <strong>{fmt(parkingCost)}</strong>, plus extra registration <strong>{fmt(pricing.regParkingCharges)}</strong>
                </p>
              )}
              {parkingIncluded && <p className="mb-3 text-base text-muted">Parking is included in the agreement value for this project, so no parking amount is added to this sale.</p>}
              {parkingSlots.map((slot, i) => (
                <div key={i} className="grid grid-3 gap-4 mb-4">
                  <TextField label={carParkingCount > 1 ? `Parking ${i + 1}: podium level` : 'Podium Floor Level'} value={slot.podium} onChange={e => updateSlot(i, 'podium', e.target.value)} placeholder="e.g. Podium 1" />
                  <TextField label="Floor" value={slot.floor} onChange={e => updateSlot(i, 'floor', e.target.value)} placeholder="e.g. Ground" />
                  <TextField label="Parking No." value={slot.number} onChange={e => updateSlot(i, 'number', e.target.value)} placeholder="e.g. P-45" />
                </div>
              ))}
            </div>
          )}

          {/* Cost summary */}
          <div className="panel mb-6">
            <div className="font-semibold text-base mb-3">Estimated Costs</div>
            {[
              ['Agreement Value', agreementValue],
              [`GST (${gstRate}%)`, gst],
              [`Stamp Duty (${stampPct}%)`, stampDuty],
              [`Registration${separateParking ? ' (incl. parking)' : ''}`, regCharges],
              ...(separateParking ? [[`Car Parking (${carParkingCount})`, parkingCost]] : []),
            ].map(([label, amount]) => (
              <div key={String(label)} className="flex justify-between text-base mb-1">
                <span className="text-secondary">{label}</span>
                <span className="font-medium">{fmt(Number(amount))}</span>
              </div>
            ))}
            <div className="pt-2 mt-2 flex justify-between font-bold border-top">
              <span>Total Payable</span>
              <span className="text-brand">{fmt(agreementValue + gst + stampDuty + regCharges + parkingCost)}</span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="primary" onClick={goToStep2} disabled={!selectedProject}>
              Review Payment Plan →
            </Button>
          </div>
        </div>
      )}

      {/* ══════════════ STEP 2 ══════════════ */}
      {step === 2 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title card-title-lg">Payment Plan</span>
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>← Back</Button>
          </div>
          {error && <Alert variant="danger" className="mb-4">{error}</Alert>}
          <p className="text-base text-muted mb-5">
            Review the milestone-based payment schedule below. Amounts are pre-calculated from the project&apos;s payment plan and your Agreement Value. You may adjust them before confirming.
          </p>

          <div className="mb-4"><Table flush>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Milestone</th>
                  <th className="text-right">% of Agreement Value</th>
                  <th className="text-right">Amount (₹)</th>
                  <th className="text-right">GST 5% (₹)</th>
                  <th className="text-right">Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((row, idx) => {
                  const rowTotal = row.principalAmount + row.gstAmount
                  return (
                    <tr key={idx}>
                      <td className="text-muted text-sm">{idx + 1}</td>
                      <td>
                        <div className="font-medium">{row.description}</div>
                        {row.percentOfAV === undefined && (
                          <div className="text-xs text-muted">Excluded from milestone %</div>
                        )}
                      </td>
                      <td className="text-right">
                        {row.percentOfAV !== undefined ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              small
                              type="number"
                              inputMode="decimal"
                              aria-label={`Milestone ${idx + 1} percentage`}
                              className="num-input text-right"
                              value={row.percentOfAV}
                              onChange={e => updateSchedulePercent(idx, Number(e.target.value) || 0)}
                            />
                            <span className="text-muted">%</span>
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="text-right">
                        <Input
                          small
                          type="number"
                          inputMode="decimal"
                          aria-label={`Milestone ${idx + 1} amount`}
                          className="amount-input text-right"
                          value={row.principalAmount}
                          onChange={e => updateScheduleAmount(idx, Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="text-right text-muted">
                        {row.gstAmount > 0 ? fmt(row.gstAmount) : <span className="text-muted text-sm">—</span>}
                      </td>
                      <td className="text-right font-semibold">{fmt(rowTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td colSpan={3} className="text-right pt-3">TOTALS</td>
                  <td className="text-right pt-3">{fmt(totalPrincipal)}</td>
                  <td className="text-right pt-3">{fmt(totalGst)}</td>
                  <td className="text-right pt-3 text-brand text-md">{fmt(grandTotal)}</td>
                </tr>
              </tfoot>
          </Table></div>

          {!isValidPlan && (
            <Alert variant="danger" className="mb-4" title={`The milestone payment plan does not match the agreement value (${fmt(agreementValue)})`}>
              <ul className="mt-2 pl-5 mb-0">
                {totalPercent !== 100 && <li>The percentages total {totalPercent}%. They must total exactly 100%.</li>}
                {totalMilestoneAmount !== agreementValue && <li>The milestone amounts total {fmt(totalMilestoneAmount)}. They must total exactly {fmt(agreementValue)}.</li>}
              </ul>
            </Alert>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>← Back</Button>
            <Button type="button" variant="primary" onClick={goToStep3} disabled={generating || !isValidPlan}>
              {generating ? 'Creating Sale...' : `Confirm & Continue →`}
            </Button>
          </div>
        </div>
      )}

      {/* ══════════════ STEP 3 ══════════════ */}
      {step === 3 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title card-title-lg">Generate Agreement</span>
          </div>
          {error && <Alert variant="danger" className="mb-4">{error}</Alert>}

          {!generatedDoc ? (
            <div className="centered-panel">
              <div className="big-emoji mb-4" aria-hidden="true">🎉</div>
              <h2 className="mb-2">Sale Created Successfully!</h2>
              <p className="text-muted mb-8">
                The sale has been recorded with all {schedules.length} payment milestones. Now generate the agreement document.
              </p>
              <Button
                type="button"
                size="lg" variant="primary"
                onClick={generateAgreement}
                loading={generating}
              >
                {generating ? 'Generating...' : saleType === 'FRESH' ? '📄 Generate Sale Agreement (DOCX)' : '📄 Generate PAAA (DOCX)'}
              </Button>
              <div className="mt-4">
                <Button type="button" variant="ghost" onClick={() => router.push(`/sales/${createdSaleId}`)}>
                  Skip — Go to Sale →
                </Button>
              </div>
            </div>
          ) : (
            <div className="centered-panel">
              <div className="big-emoji mb-4" aria-hidden="true">✅</div>
              <h2 className="mb-2">Agreement Generated!</h2>
              <p className="text-muted mb-8">
                Your {saleType === 'FRESH' ? 'Sale Agreement' : 'PAAA'} has been generated and saved.
              </p>

              <div className="flex gap-4 justify-center wrap">
                {/* Preview in browser — opens the file URL in our docx-preview page */}
                <Button
                  type="button"
                  onClick={() => window.open(`/documents/preview?url=${encodeURIComponent(generatedDoc.pdfUrl)}`, '_blank')}
                  variant="secondary"
                  size="lg"
                >
                  👁 Preview in Browser
                </Button>

                {/* Download */}
                <a
                  href={generatedDoc.pdfUrl}
                  download
                  className="btn btn-primary btn-lg"
                >
                  ⬇ Download Word File
                </a>
              </div>

              <div className="mt-6 flex gap-3 justify-center">
                <Button type="button" variant="ghost" onClick={() => router.push(`/sales/${createdSaleId}`)}>
                  Go to Sale Details →
                </Button>
                <Button type="button" variant="ghost" onClick={() => router.push(`/sales/${createdSaleId}/documents`)}>
                  Go to Documents →
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
