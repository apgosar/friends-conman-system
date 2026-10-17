'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_PRICING, computeCharges, gstOn, type PricingConfig } from '@/lib/pricing'

// Tax and pricing rules come from the selected project's settings (see lib/pricing.ts)

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

// ─── Validation helpers ──────────────────────────────────────
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validatePan(pan: string) {
  if (!pan) return ''
  return PAN_REGEX.test(pan.toUpperCase()) ? '' : 'PAN must be 5 letters + 4 numbers + 1 letter (e.g. ABCDE1234F)'
}
function validateAadhaar(aadhaar: string) {
  const digits = aadhaar.replace(/\s/g, '')
  if (!digits) return ''
  return digits.length === 12 && /^\d{12}$/.test(digits) ? '' : 'Aadhaar must be exactly 12 digits'
}
function validateEmail(email: string) {
  if (!email) return ''
  return EMAIL_REGEX.test(email) ? '' : 'Enter a valid email address'
}
function formatAadhaar(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 12)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

type Buyer = { fullName: string; panNumber: string; aadhaarNumber: string; address: string; email: string; whatsappNumber: string }
// principalAmount already includes stamp duty + registration for the plinth row
type ScheduleRow = { milestoneId: string; description: string; principalAmount: number; gstAmount: number; isPlinth?: boolean; sequence: number; percentOfAV?: number }

const emptyBuyer = (): Buyer => ({ fullName: '', panNumber: '', aadhaarNumber: '', address: '', email: '', whatsappNumber: '' })

// ─── Step indicator ──────────────────────────────────────────
import { StepBar } from '@/components/ui/StepBar'
import { Button, Input, Select, SelectField, TextField, Textarea, TextareaField } from '@/components/ui'

// ─── Main Wizard ─────────────────────────────────────────────
type Prefill = { inquiryId: string; projectId: string; unitId: string; agreementValue: number; carParking: boolean; buyerName: string; mobileNumber: string } | null

export default function NewSaleWizard({ projects, prefill = null }: { projects: any[]; prefill?: Prefill }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')

  // Step 1 state
  const [projectId, setProjectId] = useState(prefill?.projectId ?? '')
  const selectedProject = projects.find(p => p.id === projectId)
  const prefillProjectType = projects.find(p => p.id === prefill?.projectId)?.type
  const [saleType, setSaleType] = useState(prefillProjectType && prefillProjectType !== 'MIXED' ? prefillProjectType : 'FRESH')
  const [unitId, setUnitId] = useState(prefill?.unitId ?? '')
  const [tenantId, setTenantId] = useState('')
  const [agreementValue, setAgreementValue] = useState(prefill?.agreementValue ?? 10000000)
  const [bookingAmount, setBookingAmount] = useState<number | ''>('')
  const [carParking, setCarParking] = useState(prefill?.carParking ?? false)
  const [parkingPodiumLevel, setParkingPodiumLevel] = useState('')
  const [parkingFloor, setParkingFloor] = useState('')
  const [parkingNumber, setParkingNumber] = useState('')
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0])
  const [buyers, setBuyers] = useState<Buyer[]>([prefill ? { ...emptyBuyer(), fullName: prefill.buyerName, whatsappNumber: prefill.mobileNumber } : emptyBuyer()])

  // Derived financials
  const pricing: PricingConfig = selectedProject?.pricing ?? DEFAULT_PRICING
  const { gst, stampDuty, registration: regCharges } = computeCharges(pricing, agreementValue, carParking)
  const parkingCost = selectedProject?.carParkingCharges ?? 0

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
      const res = await fetch('/api/extract-kyc', { method: 'POST', body: formData })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Extraction failed')
      
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
    } catch (err: any) {
      setKycMessage({ type: 'error', text: err.message, idx })
    } finally {
      setExtractingKyc(null)
      setTimeout(() => setKycMessage(null), 6000)
    }
  }

  const updateBuyer = (idx: number, field: keyof Buyer, val: string) =>
    setBuyers(prev => prev.map((b, i) => i === idx ? { ...b, [field]: val } : b))
  const addBuyer = () => setBuyers(prev => [...prev, emptyBuyer()])
  const removeBuyer = (idx: number) => setBuyers(prev => prev.filter((_, i) => i !== idx))

  // ── Step 1 → 2: Build payment schedule from project milestones ──
  const goToStep2 = () => {
    setError('')
    if (!projectId || !unitId) { setError('Please select a project and unit.'); return }
    if (buyers.some(b => !b.fullName || !b.panNumber)) { setError('Each buyer must have a name and PAN.'); return }
    if (saleType === 'REDEVELOPMENT' && !tenantId) { setError('Please link a tenant for redevelopment sales.'); return }

    const milestones = selectedProject?.milestones ?? []

    // Find the plinth milestone by name only
    const plinthMilestone = milestones.find((m: any) =>
      m.name.toLowerCase().includes('plinth') && m.percentOfAV > 0
    )

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

    // Add car parking as a separate row if selected — NO GST on parking
    if (carParking && parkingCost > 0) {
      rows.push({
        milestoneId: possessionMilestone?.id || '',
        description: 'Car Parking',
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
        gstAmount: gst,
        stampDuty,
        registrationCharges: regCharges,
        carParking,
        carParkingCharges: carParking ? parkingCost : 0,
        parkingPodiumLevel: carParking ? parkingPodiumLevel : undefined,
        parkingFloor: carParking ? parkingFloor : undefined,
        parkingNumber: carParking ? parkingNumber : undefined,
        bookingAmount: bookingAmount !== '' ? Number(bookingAmount) : undefined,
        bookingDate,
        inquiryId: prefill?.inquiryId,
        buyers: buyers.map((b, i) => ({ ...b, isPrimary: i === 0, sequence: i + 1 })),
        paymentSchedules: schedules.filter(s => s.principalAmount > 0).map(s => ({
          milestoneId: s.milestoneId || undefined,
          description: s.description,
          principalAmount: s.principalAmount,  // already includes stamp duty + reg for plinth row
          gstAmount: s.gstAmount,
        }))
      }
      const res = await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to create sale')
      setCreatedSaleId(data.data.id)
      setStep(3)
    } catch (err: any) {
      setError(err.message)
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
      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId: createdSaleId, type: docType })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Document generation failed')
      setGeneratedDoc(data.data)
    } catch (err: any) {
      setError(err.message)
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
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <StepBar step={step} steps={['Sale Details', 'Payment Plan', 'Agreement']} />

      {/* ══════════════ STEP 1 ══════════════ */}
      {step === 1 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Sale Details</span>
          </div>
          {error && <div className="alert alert-danger mb-4">{error}</div>}

          {/* Project & Unit */}
          <h4 className="mb-3">Project & Unit</h4>
          <div className="grid grid-2 gap-4 mb-4">
            <SelectField label="Project" value={projectId} required onChange={e => {
 setProjectId(e.target.value)
 setUnitId('')
 const proj = projects.find(p => p.id === e.target.value)
 if (proj) setSaleType(proj.type === 'MIXED' ? 'FRESH' : proj.type)
 setCarParking(false)
 }}><option value="">-- Select Project --</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectField>
            <SelectField label="Sale Type *" value={saleType} onChange={e => setSaleType(e.target.value)} disabled={!selectedProject || selectedProject.type !== 'MIXED'}><option value="FRESH">Fresh Sale</option><option value="REDEVELOPMENT">Redevelopment (PAAA)</option></SelectField>
            <div className="form-group">
              <label className="form-label">Unit *</label>
              <Select value={unitId} required disabled={!selectedProject} onChange={e => setUnitId(e.target.value)}>
                <option value="">-- Select Unit --</option>
                {selectedProject?.units.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.wingName} - {u.unitNumber} ({u.configuration})</option>
                ))}
              </Select>
              {unitId && (() => {
                const selectedUnit = selectedProject?.units.find((u: any) => u.id === unitId)
                return selectedUnit ? (
                  <div className="text-muted flex gap-3" style={{ marginTop: 6, fontSize: '0.8rem' }}>
                    <span>📐 Carpet Area: <strong>{selectedUnit.carpetAreaSqft} sqft</strong></span>
                    <span>(<strong>{(selectedUnit.carpetAreaSqft * 0.092903).toFixed(2)} sqm</strong>)</span>
                  </div>
                ) : null
              })()}
            </div>
            {saleType === 'REDEVELOPMENT' && (
              <SelectField label="Link Tenant" value={tenantId} onChange={e => setTenantId(e.target.value)} required><option value="">-- Select Tenant --</option>{selectedProject?.tenants.map((t: any) => (
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
            <div key={idx} className="mb-4 relative" style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: '16px 20px' }}>
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold text-base text-secondary">
                  {idx === 0 ? '👤 Primary Buyer' : `👤 Co-owner ${idx + 1}`}
                </span>
                {idx > 0 && (
                  <Button type="button" className="text-danger" variant="ghost" size="sm" onClick={() => removeBuyer(idx)}>
                    Remove
                  </Button>
                )}
              </div>

              {/* KYC Auto-fill Section */}
              <div className="flex gap-3 mb-4 p-3 items-center wrap" style={{ background: 'var(--bg-muted, #f1f5f9)', borderRadius: 8 }}>
                <span className="text-base font-medium text-secondary flex items-center" style={{ gap: 6 }}>
                  ✨ Auto-fill via KYC
                  {extractingKyc?.startsWith(`${idx}-`) && <span className="text-brand"> (Extracting...)</span>}
                </span>
                <label className="btn btn-ghost btn-sm cursor-pointer" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                  Upload PAN
                  <input type="file" hidden accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleKycUpload(idx, 'PAN', file)
                    e.target.value = '' // reset
                  }} />
                </label>
                <label className="btn btn-ghost btn-sm cursor-pointer" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                  Upload Aadhaar
                  <input type="file" hidden accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleKycUpload(idx, 'AADHAAR', file)
                    e.target.value = '' // reset
                  }} />
                </label>
                {kycMessage?.idx === idx && (
                  <div className="w-full mt-1" style={{ fontSize: '0.85rem', color: kycMessage.type === 'success' ? 'var(--color-success, #16a34a)' : 'var(--color-danger, #dc2626)' }}>
                    {kycMessage.type === 'success' ? '✅ ' : '❌ '} {kycMessage.text}
                  </div>
                )}
              </div>

              <div className="grid grid-2 gap-4 mb-3">
                <TextField label="Full Name" value={buyer.fullName} required onChange={e => updateBuyer(idx, 'fullName', e.target.value)} placeholder="John Doe" />
                <div className="form-group">
                  <label className="form-label">PAN Number *</label>
                  <Input
                    value={buyer.panNumber}
                    required
                    onChange={e => updateBuyer(idx, 'panNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    style={buyer.panNumber && validatePan(buyer.panNumber) ? { borderColor: 'var(--color-warning, #f59e0b)' } : {}}
                  />
                  {buyer.panNumber && validatePan(buyer.panNumber) && (
                    <div className="text-xs mt-1" style={{ color: 'var(--color-warning, #f59e0b)' }}>⚠ {validatePan(buyer.panNumber)}</div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Aadhaar Number</label>
                  <Input
                    value={buyer.aadhaarNumber}
                    onChange={e => updateBuyer(idx, 'aadhaarNumber', formatAadhaar(e.target.value))}
                    placeholder="XXXX XXXX XXXX"
                    maxLength={14}
                    inputMode="numeric"
                    style={buyer.aadhaarNumber && validateAadhaar(buyer.aadhaarNumber) ? { borderColor: 'var(--color-warning, #f59e0b)' } : {}}
                  />
                  {buyer.aadhaarNumber && validateAadhaar(buyer.aadhaarNumber) && (
                    <div className="text-xs mt-1" style={{ color: 'var(--color-warning, #f59e0b)' }}>⚠ {validateAadhaar(buyer.aadhaarNumber)}</div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Email ID</label>
                  <Input
                    type="email"
                    value={buyer.email}
                    onChange={e => updateBuyer(idx, 'email', e.target.value)}
                    placeholder="john@example.com"
                    style={buyer.email && validateEmail(buyer.email) ? { borderColor: 'var(--color-warning, #f59e0b)' } : {}}
                  />
                  {buyer.email && validateEmail(buyer.email) && (
                    <div className="text-xs mt-1" style={{ color: 'var(--color-warning, #f59e0b)' }}>⚠ {validateEmail(buyer.email)}</div>
                  )}
                </div>
                <TextField label="WhatsApp" value={buyer.whatsappNumber} onChange={e => updateBuyer(idx, 'whatsappNumber', e.target.value)} placeholder="+91 98765 43210" />
              </div>
              <TextareaField label="Address" rows={2} value={buyer.address} onChange={e => updateBuyer(idx, 'address', e.target.value)} />
            </div>
          ))}

          <div className="divider" />

          {/* Financials */}
          <h4 className="mb-3">Financials</h4>
          <div className="grid grid-2 gap-4 mb-4">
            <TextField label="Agreement Value (₹) *" type="number" min={100000} step={1000} value={agreementValue} onChange={e => setAgreementValue(Number(e.target.value))} />
            <TextField label="Booking Amount (₹)" type="number" placeholder="Leave blank to use default %" value={bookingAmount} onChange={e => setBookingAmount(e.target.value ? Number(e.target.value) : '')} />
            <TextField label="Booking Date *" type="date" value={bookingDate} onChange={e => setBookingDate(e.target.value)} />
          </div>

          {/* Car Parking */}
          <div className="form-group mb-5">
            <label className="form-label">Car Parking</label>
            <div className="flex gap-3" style={{ marginTop: 6 }}>
              {(['Yes', 'No'] as const).map(opt => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer" style={{ padding: '10px 20px', borderRadius: 8, border: `2px solid ${(opt === 'Yes') === carParking ? 'var(--color-primary)' : 'var(--border-color)'}`, background: (opt === 'Yes') === carParking ? 'var(--color-primary-light, #ede9fe)' : 'transparent', fontWeight: (opt === 'Yes') === carParking ? 600 : 400 }}>
                  <input type="radio" checked={(opt === 'Yes') === carParking} onChange={() => setCarParking(opt === 'Yes')} style={{ accentColor: 'var(--color-primary)' }} />
                  {opt}
                </label>
              ))}
            </div>
            {carParking && selectedProject && (
              <div className="mt-3">
                <p className="mb-3 text-base text-muted">
                  Car parking: <strong>{fmt(parkingCost)}</strong> + Registration: <strong>{fmt(pricing.regParkingCharges)}</strong>
                </p>
                <div className="grid grid-3 gap-4">
                  <TextField label="Podium Floor Level" value={parkingPodiumLevel} onChange={e => setParkingPodiumLevel(e.target.value)} placeholder="e.g. Podium 1" />
                  <TextField label="Floor" value={parkingFloor} onChange={e => setParkingFloor(e.target.value)} placeholder="e.g. Ground" />
                  <TextField label="Parking No." value={parkingNumber} onChange={e => setParkingNumber(e.target.value)} placeholder="e.g. P-45" />
                </div>
              </div>
            )}
          </div>

          {/* Cost summary */}
          <div className="mb-6" style={{ background: 'var(--bg-muted, #f8f9fa)', borderRadius: 10, padding: '16px 20px', border: '1px solid var(--border-color)' }}>
            <div className="font-semibold text-base" style={{ marginBottom: 10 }}>Estimated Costs</div>
            {[
              ['Agreement Value', agreementValue],
              [`GST (${pricing.gstRatePercent}%)`, gst],
              [`Stamp Duty (${pricing.stampDutyPercent}%)`, stampDuty],
              [`Registration${carParking ? ' (incl. parking)' : ''}`, regCharges],
              ...(carParking ? [['Car Parking', parkingCost]] : []),
            ].map(([label, amount]) => (
              <div key={String(label)} className="flex justify-between text-base mb-1">
                <span className="text-secondary">{label}</span>
                <span className="font-medium">{fmt(Number(amount))}</span>
              </div>
            ))}
            <div className="pt-2 flex justify-between font-bold" style={{ borderTop: '1px solid var(--border-color)', marginTop: 6 }}>
              <span>Total Payable</span>
              <span className="text-brand">{fmt(agreementValue + gst + stampDuty + regCharges + (carParking ? parkingCost : 0))}</span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="primary" onClick={goToStep2} disabled={!selectedProject}>
              Next: Review Payment Plan →
            </Button>
          </div>
        </div>
      )}

      {/* ══════════════ STEP 2 ══════════════ */}
      {step === 2 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Payment Plan</span>
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>← Back</Button>
          </div>
          {error && <div className="alert alert-danger mb-4">{error}</div>}
          <p className="text-base text-muted mb-5">
            Review the milestone-based payment schedule below. Amounts are pre-calculated from the project&apos;s payment plan and your Agreement Value. You may adjust them before confirming.
          </p>

          <div className="table-wrapper mb-4" style={{ border: 'none' }}>
            <table>
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
                      <td className="text-muted" style={{ fontSize: '0.8rem' }}>{idx + 1}</td>
                      <td>
                        <div className="font-medium">{row.description}</div>
                        {row.percentOfAV === undefined && (
                          <div className="text-xs text-muted" style={{ marginTop: 2 }}>Excluded from milestone %</div>
                        )}
                      </td>
                      <td className="text-right">
                        {row.percentOfAV !== undefined ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              className="text-right text-base"
                              style={{ width: 70, padding: '4px 8px' }}
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
                          type="number"
                          className="text-right text-base"
                          style={{ width: 130, padding: '4px 8px' }}
                          value={row.principalAmount}
                          onChange={e => updateScheduleAmount(idx, Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="text-right text-muted">
                        {row.gstAmount > 0 ? fmt(row.gstAmount) : <span className="text-muted" style={{ fontSize: '0.8rem' }}>—</span>}
                      </td>
                      <td className="text-right font-semibold">{fmt(rowTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold" style={{ borderTop: '2px solid var(--border-color)' }}>
                  <td colSpan={3} className="text-right pt-3">TOTALS</td>
                  <td className="text-right pt-3">{fmt(totalPrincipal)}</td>
                  <td className="text-right pt-3">{fmt(totalGst)}</td>
                  <td className="text-right pt-3 text-brand text-md">{fmt(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {!isValidPlan && (
            <div className="mb-4 text-base" style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '12px 16px', borderRadius: 8 }}>
              <strong>Warning:</strong> The milestone payment plan does not match the Agreement Value ({fmt(agreementValue)}).
              <ul className="mt-2 pl-5 mb-0">
                {totalPercent !== 100 && <li>Total percentage is {totalPercent}%, but must equal exactly 100%.</li>}
                {totalMilestoneAmount !== agreementValue && <li>Total milestone amount is {fmt(totalMilestoneAmount)}, but must equal exactly {fmt(agreementValue)}.</li>}
              </ul>
            </div>
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
            <span className="card-title">Generate Agreement</span>
          </div>
          {error && <div className="alert alert-danger mb-4">{error}</div>}

          {!generatedDoc ? (
            <div className="text-center" style={{ padding: '40px 24px' }}>
              <div className="mb-4" style={{ fontSize: 64 }}>🎉</div>
              <h2 className="mb-2">Sale Created Successfully!</h2>
              <p className="text-muted mb-8">
                The sale has been recorded with all {schedules.length} payment milestones. Now generate the agreement document.
              </p>
              <Button
                type="button"
                className="text-md" variant="primary"
                style={{ padding: '14px 32px' }}
                onClick={generateAgreement}
                disabled={generating}
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
            <div className="text-center" style={{ padding: '40px 24px' }}>
              <div className="mb-4" style={{ fontSize: 64 }}>✅</div>
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
                  style={{ fontSize: '0.95rem', padding: '12px 28px' }}
                >
                  👁 Preview in Browser
                </Button>

                {/* Download */}
                <a
                  href={generatedDoc.pdfUrl}
                  download
                  className="btn btn-primary"
                  style={{ fontSize: '0.95rem', padding: '12px 28px' }}
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
