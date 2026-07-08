'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── Constants ───────────────────────────────────────────────
const GST_RATE = 0.05
const STAMP_DUTY_RATE = 0.06
const REG_BASE = 30000
const REG_PARKING = 20000

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
function StepBar({ step }: { step: number }) {
  const steps = ['Sale Details', 'Payment Plan', 'Agreement']
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32, gap: 0 }}>
      {steps.map((label, i) => {
        const num = i + 1
        const active = step === num
        const done = step > num
        return (
          <div key={num} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : undefined }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: '0.9rem',
                background: done ? 'var(--color-success)' : active ? 'var(--color-primary)' : 'var(--bg-muted)',
                color: (done || active) ? '#fff' : 'var(--text-muted)',
                border: active ? '3px solid var(--color-primary)' : 'none',
              }}>
                {done ? '✓' : num}
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: active ? 600 : 400, color: active ? 'var(--color-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? 'var(--color-success)' : 'var(--border-color)', margin: '0 8px', marginBottom: 20 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Wizard ─────────────────────────────────────────────
export default function NewSaleWizard({ projects }: { projects: any[] }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')

  // Step 1 state
  const [projectId, setProjectId] = useState('')
  const selectedProject = projects.find(p => p.id === projectId)
  const [saleType, setSaleType] = useState('FRESH')
  const [unitId, setUnitId] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [agreementValue, setAgreementValue] = useState(10000000)
  const [bookingAmount, setBookingAmount] = useState<number | ''>('')
  const [carParking, setCarParking] = useState(false)
  const [parkingPodiumLevel, setParkingPodiumLevel] = useState('')
  const [parkingFloor, setParkingFloor] = useState('')
  const [parkingNumber, setParkingNumber] = useState('')
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0])
  const [buyers, setBuyers] = useState<Buyer[]>([emptyBuyer()])

  // Derived financials
  const stampDuty = Math.round(agreementValue * STAMP_DUTY_RATE)
  const gst = Math.round(agreementValue * GST_RATE)
  const parkingCost = selectedProject?.carParkingCharges ?? 0
  const regCharges = carParking ? REG_BASE + REG_PARKING : REG_BASE

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

    // Filter out 0% milestones except the very first (booking slot)
    const activeMilestones = milestones.filter((m: any, idx: number) =>
      idx === 0 || (m.percentOfAV && m.percentOfAV > 0)
    )

    const rows: ScheduleRow[] = activeMilestones.flatMap((m: any, index: number) => {
      let basePrincipal = Math.round(agreementValue * (m.percentOfAV / 100))

      if (bookingAmount !== '' && Number(bookingAmount) > 0) {
        if (index === 0) {
          basePrincipal = Number(bookingAmount)
        } else if (index === 1) {
          const originalFirst = Math.round(agreementValue * (activeMilestones[0].percentOfAV / 100))
          basePrincipal += (originalFirst - Number(bookingAmount))
        }
      }

      const isPlinth = m.id === plinthMilestone?.id
      const gstAmt = Math.round(basePrincipal * GST_RATE)

      const pct = Number(((basePrincipal / agreementValue) * 100).toFixed(2))
      const milestoneRow: ScheduleRow = {
        milestoneId: m.id,
        description: m.name,
        principalAmount: basePrincipal,
        gstAmount: gstAmt,
        isPlinth: false,
        sequence: m.sequence,
        percentOfAV: pct,
      }

      // Insert Stamp Duty & Registration as a separate row IMMEDIATELY after Plinth Completion
      if (isPlinth && (stampDuty > 0 || regCharges > 0)) {
        const stampDutyRow: ScheduleRow = {
          milestoneId: plinthMilestone?.id || '',
          description: 'Stamp Duty and Registration',
          principalAmount: stampDuty + regCharges,
          gstAmount: 0,
          isPlinth: true,
          sequence: m.sequence,
        }
        return [milestoneRow, stampDutyRow]
      }

      return [milestoneRow]
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
      const newGst = r.percentOfAV !== undefined ? Math.round(newAmt * GST_RATE) : 0
      const newPct = r.percentOfAV !== undefined ? Number(((newAmt / agreementValue) * 100).toFixed(2)) : undefined
      return { ...r, principalAmount: newAmt, gstAmount: newGst, percentOfAV: newPct }
    }))
  }

  const updateSchedulePercent = (idx: number, newPct: number) => {
    setSchedules(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const newAmt = Math.round((newPct / 100) * agreementValue)
      const newGst = r.percentOfAV !== undefined ? Math.round(newAmt * GST_RATE) : 0
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
        buyers: buyers.map((b, i) => ({ ...b, isPrimary: i === 0, sequence: i + 1 })),
        paymentSchedules: schedules.map(s => ({
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
      <StepBar step={step} />

      {/* ══════════════ STEP 1 ══════════════ */}
      {step === 1 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Sale Details</span>
          </div>
          {error && <div className="alert alert-danger mb-4">{error}</div>}

          {/* Project & Unit */}
          <h4 style={{ marginBottom: 12 }}>Project & Unit</h4>
          <div className="grid grid-2 gap-4 mb-4">
            <div className="form-group">
              <label className="form-label">Project *</label>
              <select className="form-select" value={projectId} required onChange={e => {
                setProjectId(e.target.value)
                setUnitId('')
                const proj = projects.find(p => p.id === e.target.value)
                if (proj) setSaleType(proj.type === 'MIXED' ? 'FRESH' : proj.type)
                setCarParking(false)
              }}>
                <option value="">-- Select Project --</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Sale Type *</label>
              <select className="form-select" value={saleType} onChange={e => setSaleType(e.target.value)} disabled={!selectedProject || selectedProject.type !== 'MIXED'}>
                <option value="FRESH">Fresh Sale</option>
                <option value="REDEVELOPMENT">Redevelopment (PAAA)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Unit *</label>
              <select className="form-select" value={unitId} required disabled={!selectedProject} onChange={e => setUnitId(e.target.value)}>
                <option value="">-- Select Unit --</option>
                {selectedProject?.units.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.wingName} - {u.unitNumber} ({u.configuration})</option>
                ))}
              </select>
              {unitId && (() => {
                const selectedUnit = selectedProject?.units.find((u: any) => u.id === unitId)
                return selectedUnit ? (
                  <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                    <span>📐 Carpet Area: <strong>{selectedUnit.carpetAreaSqft} sqft</strong></span>
                    <span>(<strong>{(selectedUnit.carpetAreaSqft * 0.092903).toFixed(2)} sqm</strong>)</span>
                  </div>
                ) : null
              })()}
            </div>
            {saleType === 'REDEVELOPMENT' && (
              <div className="form-group">
                <label className="form-label">Link Tenant *</label>
                <select className="form-select" value={tenantId} onChange={e => setTenantId(e.target.value)} required>
                  <option value="">-- Select Tenant --</option>
                  {selectedProject?.tenants.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name} (Old: {t.oldFlatNumber})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="divider" />

          {/* Buyers */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0 }}>Buyer Details</h4>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addBuyer}>+ Add Co-owner</button>
          </div>
          {buyers.map((buyer, idx) => (
            <div key={idx} style={{
              border: '1px solid var(--border-color)', borderRadius: 10, padding: '16px 20px',
              marginBottom: 16, position: 'relative'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {idx === 0 ? '👤 Primary Buyer' : `👤 Co-owner ${idx + 1}`}
                </span>
                {idx > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeBuyer(idx)} style={{ color: 'var(--color-danger)' }}>
                    Remove
                  </button>
                )}
              </div>

              {/* KYC Auto-fill Section */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, background: 'var(--bg-muted, #f1f5f9)', padding: 12, borderRadius: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✨ Auto-fill via KYC
                  {extractingKyc?.startsWith(`${idx}-`) && <span style={{ color: 'var(--color-primary)' }}> (Extracting...)</span>}
                </span>
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                  Upload PAN
                  <input type="file" hidden accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleKycUpload(idx, 'PAN', file)
                    e.target.value = '' // reset
                  }} />
                </label>
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                  Upload Aadhaar
                  <input type="file" hidden accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleKycUpload(idx, 'AADHAAR', file)
                    e.target.value = '' // reset
                  }} />
                </label>
                {kycMessage?.idx === idx && (
                  <div style={{ width: '100%', marginTop: 4, fontSize: '0.85rem', color: kycMessage.type === 'success' ? 'var(--color-success, #16a34a)' : 'var(--color-danger, #dc2626)' }}>
                    {kycMessage.type === 'success' ? '✅ ' : '❌ '} {kycMessage.text}
                  </div>
                )}
              </div>

              <div className="grid grid-2 gap-4 mb-3">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input className="form-input" value={buyer.fullName} required onChange={e => updateBuyer(idx, 'fullName', e.target.value)} placeholder="John Doe" />
                </div>
                <div className="form-group">
                  <label className="form-label">PAN Number *</label>
                  <input
                    className="form-input"
                    value={buyer.panNumber}
                    required
                    onChange={e => updateBuyer(idx, 'panNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    style={buyer.panNumber && validatePan(buyer.panNumber) ? { borderColor: 'var(--color-warning, #f59e0b)' } : {}}
                  />
                  {buyer.panNumber && validatePan(buyer.panNumber) && (
                    <div style={{ color: 'var(--color-warning, #f59e0b)', fontSize: '0.75rem', marginTop: 4 }}>⚠ {validatePan(buyer.panNumber)}</div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Aadhaar Number</label>
                  <input
                    className="form-input"
                    value={buyer.aadhaarNumber}
                    onChange={e => updateBuyer(idx, 'aadhaarNumber', formatAadhaar(e.target.value))}
                    placeholder="XXXX XXXX XXXX"
                    maxLength={14}
                    inputMode="numeric"
                    style={buyer.aadhaarNumber && validateAadhaar(buyer.aadhaarNumber) ? { borderColor: 'var(--color-warning, #f59e0b)' } : {}}
                  />
                  {buyer.aadhaarNumber && validateAadhaar(buyer.aadhaarNumber) && (
                    <div style={{ color: 'var(--color-warning, #f59e0b)', fontSize: '0.75rem', marginTop: 4 }}>⚠ {validateAadhaar(buyer.aadhaarNumber)}</div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Email ID</label>
                  <input
                    className="form-input"
                    type="email"
                    value={buyer.email}
                    onChange={e => updateBuyer(idx, 'email', e.target.value)}
                    placeholder="john@example.com"
                    style={buyer.email && validateEmail(buyer.email) ? { borderColor: 'var(--color-warning, #f59e0b)' } : {}}
                  />
                  {buyer.email && validateEmail(buyer.email) && (
                    <div style={{ color: 'var(--color-warning, #f59e0b)', fontSize: '0.75rem', marginTop: 4 }}>⚠ {validateEmail(buyer.email)}</div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">WhatsApp</label>
                  <input className="form-input" value={buyer.whatsappNumber} onChange={e => updateBuyer(idx, 'whatsappNumber', e.target.value)} placeholder="+91 98765 43210" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-textarea" rows={2} value={buyer.address} onChange={e => updateBuyer(idx, 'address', e.target.value)} />
              </div>
            </div>
          ))}

          <div className="divider" />

          {/* Financials */}
          <h4 style={{ marginBottom: 12 }}>Financials</h4>
          <div className="grid grid-2 gap-4 mb-4">
            <div className="form-group">
              <label className="form-label">Agreement Value (₹) *</label>
              <input type="number" className="form-input" min={100000} step={1000} value={agreementValue} onChange={e => setAgreementValue(Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Booking Amount (₹)</label>
              <input type="number" className="form-input" placeholder="Leave blank to use default %" value={bookingAmount} onChange={e => setBookingAmount(e.target.value ? Number(e.target.value) : '')} />
            </div>
            <div className="form-group">
              <label className="form-label">Booking Date *</label>
              <input type="date" className="form-input" value={bookingDate} onChange={e => setBookingDate(e.target.value)} />
            </div>
          </div>

          {/* Car Parking */}
          <div className="form-group mb-5">
            <label className="form-label">Car Parking</label>
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              {(['Yes', 'No'] as const).map(opt => (
                <label key={opt} style={{
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  padding: '10px 20px', borderRadius: 8,
                  border: `2px solid ${(opt === 'Yes') === carParking ? 'var(--color-primary)' : 'var(--border-color)'}`,
                  background: (opt === 'Yes') === carParking ? 'var(--color-primary-light, #ede9fe)' : 'transparent',
                  fontWeight: (opt === 'Yes') === carParking ? 600 : 400,
                }}>
                  <input type="radio" checked={(opt === 'Yes') === carParking} onChange={() => setCarParking(opt === 'Yes')} style={{ accentColor: 'var(--color-primary)' }} />
                  {opt}
                </label>
              ))}
            </div>
            {carParking && selectedProject && (
              <div style={{ marginTop: 12 }}>
                <p style={{ marginBottom: 12, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  Car parking: <strong>{fmt(parkingCost)}</strong> + Registration: <strong>{fmt(REG_PARKING)}</strong>
                </p>
                <div className="grid grid-3 gap-4">
                  <div className="form-group">
                    <label className="form-label">Podium Floor Level</label>
                    <input className="form-input" value={parkingPodiumLevel} onChange={e => setParkingPodiumLevel(e.target.value)} placeholder="e.g. Podium 1" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Floor</label>
                    <input className="form-input" value={parkingFloor} onChange={e => setParkingFloor(e.target.value)} placeholder="e.g. Ground" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Parking No.</label>
                    <input className="form-input" value={parkingNumber} onChange={e => setParkingNumber(e.target.value)} placeholder="e.g. P-45" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Cost summary */}
          <div style={{ background: 'var(--bg-muted, #f8f9fa)', borderRadius: 10, padding: '16px 20px', marginBottom: 24, border: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: '0.875rem' }}>Estimated Costs</div>
            {[
              ['Agreement Value', agreementValue],
              [`GST (5%)`, gst],
              [`Stamp Duty (6%)`, stampDuty],
              [`Registration${carParking ? ' (incl. parking)' : ''}`, regCharges],
              ...(carParking ? [['Car Parking', parkingCost]] : []),
            ].map(([label, amount]) => (
              <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: 4 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontWeight: 500 }}>{fmt(Number(amount))}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8, marginTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>Total Payable</span>
              <span style={{ color: 'var(--color-primary)' }}>{fmt(agreementValue + gst + stampDuty + regCharges + (carParking ? parkingCost : 0))}</span>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="button" className="btn btn-primary" onClick={goToStep2} disabled={!selectedProject}>
              Next: Review Payment Plan →
            </button>
          </div>
        </div>
      )}

      {/* ══════════════ STEP 2 ══════════════ */}
      {step === 2 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Payment Plan</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>← Back</button>
          </div>
          {error && <div className="alert alert-danger mb-4">{error}</div>}
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 20 }}>
            Review the milestone-based payment schedule below. Amounts are pre-calculated from the project's payment plan and your Agreement Value. You may adjust them before confirming.
          </p>

          <div className="table-wrapper" style={{ border: 'none', marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Milestone</th>
                  <th style={{ textAlign: 'right' }}>% of Agreement Value</th>
                  <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                  <th style={{ textAlign: 'right' }}>GST 5% (₹)</th>
                  <th style={{ textAlign: 'right' }}>Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((row, idx) => {
                  const rowTotal = row.principalAmount + row.gstAmount
                  return (
                    <tr key={idx}>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{row.description}</div>
                        {row.percentOfAV === undefined && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Excluded from milestone %</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {row.percentOfAV !== undefined ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                            <input
                              type="number"
                              className="form-input"
                              style={{ width: 70, textAlign: 'right', padding: '4px 8px', fontSize: '0.875rem' }}
                              value={row.percentOfAV}
                              onChange={e => updateSchedulePercent(idx, Number(e.target.value) || 0)}
                            />
                            <span style={{ color: 'var(--text-muted)' }}>%</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: 130, textAlign: 'right', padding: '4px 8px', fontSize: '0.875rem' }}
                          value={row.principalAmount}
                          onChange={e => updateScheduleAmount(idx, Number(e.target.value) || 0)}
                        />
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                        {row.gstAmount > 0 ? fmt(row.gstAmount) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(rowTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 700 }}>
                  <td colSpan={3} style={{ textAlign: 'right', paddingTop: 12 }}>TOTALS</td>
                  <td style={{ textAlign: 'right', paddingTop: 12 }}>{fmt(totalPrincipal)}</td>
                  <td style={{ textAlign: 'right', paddingTop: 12 }}>{fmt(totalGst)}</td>
                  <td style={{ textAlign: 'right', paddingTop: 12, color: 'var(--color-primary)', fontSize: '1rem' }}>{fmt(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {!isValidPlan && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: '0.875rem' }}>
              <strong>Warning:</strong> The milestone payment plan does not match the Agreement Value ({fmt(agreementValue)}).
              <ul style={{ marginTop: 8, paddingLeft: 20, marginBottom: 0 }}>
                {totalPercent !== 100 && <li>Total percentage is {totalPercent}%, but must equal exactly 100%.</li>}
                {totalMilestoneAmount !== agreementValue && <li>Total milestone amount is {fmt(totalMilestoneAmount)}, but must equal exactly {fmt(agreementValue)}.</li>}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
            <button type="button" className="btn btn-primary" onClick={goToStep3} disabled={generating || !isValidPlan}>
              {generating ? 'Creating Sale...' : `Confirm & Continue →`}
            </button>
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
            <div style={{ textAlign: 'center', padding: '40px 24px' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
              <h2 style={{ marginBottom: 8 }}>Sale Created Successfully!</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
                The sale has been recorded with all {schedules.length} payment milestones. Now generate the agreement document.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: '1rem', padding: '14px 32px' }}
                onClick={generateAgreement}
                disabled={generating}
              >
                {generating ? 'Generating...' : saleType === 'FRESH' ? '📄 Generate Sale Agreement (DOCX)' : '📄 Generate PAAA (DOCX)'}
              </button>
              <div style={{ marginTop: 16 }}>
                <button type="button" className="btn btn-ghost" onClick={() => router.push(`/sales/${createdSaleId}`)}>
                  Skip — Go to Sale →
                </button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 24px' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
              <h2 style={{ marginBottom: 8 }}>Agreement Generated!</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
                Your {saleType === 'FRESH' ? 'Sale Agreement' : 'PAAA'} has been generated and saved.
              </p>

              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
                {/* Preview in browser — opens the file URL in our docx-preview page */}
                <button
                  type="button"
                  onClick={() => window.open(`/documents/preview?url=${encodeURIComponent(generatedDoc.pdfUrl)}`, '_blank')}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.95rem', padding: '12px 28px' }}
                >
                  👁 Preview in Browser
                </button>

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

              <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button type="button" className="btn btn-ghost" onClick={() => router.push(`/sales/${createdSaleId}`)}>
                  Go to Sale Details →
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => router.push(`/sales/${createdSaleId}/documents`)}>
                  Go to Documents →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
