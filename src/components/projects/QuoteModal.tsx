'use client'

import { INQUIRY_SOURCES, SOURCE_LABEL } from '@/lib/inquiry-constants'
import { Alert, Button, CheckboxField, Modal, PhoneField, SelectField, TextField } from '@/components/ui'
import { PHONE_ERROR, normalizePhone } from '@/lib/phone'
import { formatDate, formatRupees } from '@/lib/format'

const NEEDS_DETAIL = ['REFERRAL', 'BROKER']

export function QuoteModal({
  showQuoteForm,
  setShowQuoteForm,
  selectedUnit,
  quoteData,
  setQuoteData,
  handleGenerateQuote,
  isSubmittingQuote,
  projectParkingCharge,
  parkingInAgreement = false,
  existingInquiries = [],
}: any) {
  if (!showQuoteForm || !selectedUnit) return null

  const set = (patch: Record<string, unknown>) => setQuoteData({ ...quoteData, ...patch })
  const area = Number(selectedUnit.carpetAreaSqft)
  const agreement = Number(quoteData.agreementValue)

  // Repeat-customer check: same mobile number already has an inquiry in this project
  const quotePhone = normalizePhone(quoteData.mobileNumber)
  const repeats = quotePhone.ok && quotePhone.value
    ? existingInquiries.filter((q: any) => q.mobileNumber === quotePhone.value)
    : []

  // When the project already includes parking in the agreement value there is nothing to add
  const addParking = !parkingInAgreement && !!quoteData.parkingIncluded
  const registration = addParking ? 50000 : 30000
  const rows: [string, string][] = [
    ['Agreement Value', formatRupees(agreement)],
    ...(addParking ? [['Parking Charges', formatRupees(projectParkingCharge)] as [string, string]] : []),
    ['Stamp Duty (6%)', formatRupees(agreement * 0.06)],
    ['GST (5%)', formatRupees(agreement * 0.05)],
    ['Registration', formatRupees(registration)],
  ]
  const total = agreement + agreement * 0.11 + registration + (addParking ? projectParkingCharge : 0)

  return (
    <Modal
      title="Create quote"
      subtitle={`Unit ${selectedUnit.unitNumber} • ${selectedUnit.carpetAreaSqft} sqft`}
      dismissible={!isSubmittingQuote}
      onClose={() => setShowQuoteForm(false)}
      footer={
        <>
          <Button onClick={() => setShowQuoteForm(false)} disabled={isSubmittingQuote}>Cancel</Button>
          <Button type="submit" form="quote-form" variant="primary" loading={isSubmittingQuote}>{isSubmittingQuote ? 'Generating PDF…' : 'Generate Quote'}</Button>
        </>
      }
    >
      <form id="quote-form" onSubmit={handleGenerateQuote} className="flex dir-col gap-4">
        <div className="grid grid-2 gap-4">
          <TextField label="Customer name" required value={quoteData.customerName} onChange={(e) => set({ customerName: e.target.value })} />
          <PhoneField
            id="quote-mobile"
            label="Mobile number"
            required
            value={quoteData.mobileNumber}
            error={quotePhone.ok ? undefined : PHONE_ERROR}
            onValueChange={(v) => set({ mobileNumber: v })}
          />
        </div>

        {repeats.length > 0 && (
          <Alert variant="warning" title={`Repeat customer: ${repeats.length} earlier inquir${repeats.length === 1 ? 'y' : 'ies'} on this number`}>
            {repeats.slice(0, 4).map((q: any) => (
              <div key={q.id}>
                {q.customerName} · Unit {q.unitNumber} · {formatRupees(q.totalCost)} · {formatDate(q.createdAt)}{q.status !== 'OPEN' ? ` (${q.status.toLowerCase()})` : ''}
              </div>
            ))}
            {repeats.length > 4 && <div className="text-muted">…and {repeats.length - 4} more</div>}
          </Alert>
        )}

        <div className="grid grid-2 gap-4">
          <TextField label="Email (optional)" type="email" value={quoteData.email ?? ''} onChange={(e) => set({ email: e.target.value })} />
          <TextField label="Quote valid for (days)" type="number" min={1} max={365} value={quoteData.validityDays ?? 7} onChange={(e) => set({ validityDays: e.target.value })} />
        </div>

        <div className="grid grid-2 gap-4">
          <SelectField label="Lead source" value={quoteData.source ?? ''} onChange={(e) => set({ source: e.target.value })}>
            <option value="">Select…</option>
            {INQUIRY_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </SelectField>
          <TextField label="Referrer / broker name" disabled={!NEEDS_DETAIL.includes(quoteData.source)} value={quoteData.sourceDetail ?? ''} onChange={(e) => set({ sourceDetail: e.target.value })} />
        </div>

        <div className="grid grid-2 gap-4">
          <TextField
            label="Rate (₹/sqft)"
            required
            type="number"
            inputMode="decimal"
            value={quoteData.rate}
            onChange={(e) => set({ rate: e.target.value, agreementValue: e.target.value ? String(Number(e.target.value) * area) : '' })}
          />
          <TextField
            label="Agreement value (₹)"
            required
            type="number"
            inputMode="decimal"
            value={quoteData.agreementValue}
            onChange={(e) => set({ agreementValue: e.target.value, rate: e.target.value ? String(Math.round(Number(e.target.value) / area)) : '' })}
          />
        </div>

        {!parkingInAgreement && (
          <CheckboxField
            label="Include parking"
            hint={`+₹${(projectParkingCharge / 100000).toFixed(1)}L`}
            checked={quoteData.parkingIncluded}
            onChange={(e) => set({ parkingIncluded: e.target.checked })}
          />
        )}

        {agreement > 0 && (
          <div className="panel kv-list" aria-label="Cost estimate">
            {rows.map(([label, value]) => (
              <div key={label} className="kv-row"><span className="kv-label">{label}</span><span className="kv-value">{value}</span></div>
            ))}
            <div className="kv-row"><span className="font-semibold">Total cost</span><span className="kv-value text-md">{formatRupees(total)}</span></div>
          </div>
        )}
      </form>
    </Modal>
  )
}
