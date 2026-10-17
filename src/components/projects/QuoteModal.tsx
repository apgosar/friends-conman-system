import React from 'react'
import { INQUIRY_SOURCES, SOURCE_LABEL } from '@/lib/inquiry-constants'
import { Button } from '@/components/ui'
import { formatDate, formatRupees } from '@/lib/format'

export function QuoteModal({
  showQuoteForm,
  setShowQuoteForm,
  selectedUnit,
  quoteData,
  setQuoteData,
  handleGenerateQuote,
  isSubmittingQuote,
  projectParkingCharge,
  existingInquiries = [],
}: any) {
  if (!showQuoteForm || !selectedUnit) return null

  // Repeat-customer check: same mobile number already has an inquiry in this project
  const repeats = quoteData.mobileNumber?.length === 10
    ? existingInquiries.filter((q: any) => q.mobileNumber === quoteData.mobileNumber)
    : []

  return (
    <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setShowQuoteForm(false)} />
      <div className="relative w-full overflow-hidden" style={{ background: 'var(--bg-card)', maxWidth: 500, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)' }}>
        <div className="flex justify-between items-center" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
          <div>
            <h3 className="text-xl font-semibold m-0 text-primary">Create Quote</h3>
            <p className="text-sm text-muted" style={{ margin: '4px 0 0' }}>Unit {selectedUnit.unitNumber} • {selectedUnit.carpetAreaSqft} sqft</p>
          </div>
          <button onClick={() => setShowQuoteForm(false)} className="flex items-center justify-center text-muted cursor-pointer" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, fontSize: '1.2rem', transition: 'background 0.2s' }}>×</button>
        </div>
        
        <form onSubmit={handleGenerateQuote} className="p-6">
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-secondary" style={{ marginBottom: 6 }}>Customer Name</label>
              <input required type="text" value={quoteData.customerName} onChange={e => setQuoteData({...quoteData, customerName: e.target.value})} 
                className="w-full text-primary" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', transition: 'border 0.2s', boxSizing: 'border-box' }} 
                onFocus={e => e.target.style.borderColor = 'var(--color-primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>
            
            <div className="flex-1">
              <label className="block text-sm font-medium text-secondary" style={{ marginBottom: 6 }}>Mobile Number</label>
              <input required type="tel" pattern="[0-9]{10}" title="Please enter a valid 10-digit mobile number" maxLength={10} minLength={10} 
                value={quoteData.mobileNumber} onChange={e => setQuoteData({...quoteData, mobileNumber: e.target.value.replace(/\D/g, '')})} 
                className="w-full text-primary" style={{ padding: '10px 14px', borderRadius: 8, border: `1px solid ${quoteData.mobileNumber && quoteData.mobileNumber.length !== 10 ? 'var(--color-danger, #ef4444)' : 'var(--border-color)'}`, background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', transition: 'border 0.2s', boxSizing: 'border-box' }}
                onFocus={e => { if (quoteData.mobileNumber.length === 10 || !quoteData.mobileNumber) e.target.style.borderColor = 'var(--color-primary)' }} 
                onBlur={e => { if (quoteData.mobileNumber.length === 10 || !quoteData.mobileNumber) e.target.style.borderColor = 'var(--border-color)' }}
              />
              {quoteData.mobileNumber && quoteData.mobileNumber.length !== 10 && (
                <div className="text-xs mt-1" style={{ color: 'var(--color-danger, #ef4444)' }}>⚠ Must be exactly 10 digits</div>
              )}
            </div>
          </div>

          {repeats.length > 0 && (
            <div className="mb-4 text-sm text-primary" style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-warning-light, #fef3c7)', border: '1px solid var(--color-warning, #f59e0b)' }}>
              <div className="font-semibold mb-1">⚠ Repeat customer — {repeats.length} earlier inquir{repeats.length === 1 ? 'y' : 'ies'} on this number</div>
              {repeats.slice(0, 4).map((q: any) => (
                <div key={q.id} className="text-secondary">
                  {q.customerName} · Unit {q.unitNumber} · {formatRupees(q.totalCost)} · {formatDate(q.createdAt)}{q.status !== 'OPEN' ? ` (${q.status.toLowerCase()})` : ''}
                </div>
              ))}
              {repeats.length > 4 && <div className="text-muted">…and {repeats.length - 4} more</div>}
            </div>
          )}

          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-secondary" style={{ marginBottom: 6 }}>Email (optional)</label>
              <input type='email' value={quoteData.email ?? ''} onChange={e => setQuoteData({...quoteData, email: e.target.value})} className="w-full text-primary" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', boxSizing: 'border-box' }} />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-secondary" style={{ marginBottom: 6 }}>Quote Valid For (days)</label>
              <input type='number' min={1} max={365} value={quoteData.validityDays ?? 7} onChange={e => setQuoteData({...quoteData, validityDays: e.target.value})} className="w-full text-primary" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-secondary" style={{ marginBottom: 6 }}>Lead Source</label>
              <select value={quoteData.source ?? ''} onChange={e => setQuoteData({...quoteData, source: e.target.value})} className="w-full text-primary" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', boxSizing: 'border-box' }}>
                <option value=''>— Select —</option>
                {INQUIRY_SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-secondary" style={{ marginBottom: 6 }}>Referrer / Broker name</label>
              <input type='text' disabled={!(['REFERRAL', 'BROKER'].includes(quoteData.source))} value={quoteData.sourceDetail ?? ''} onChange={e => setQuoteData({...quoteData, sourceDetail: e.target.value})} className="w-full text-primary" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div className="flex gap-4 mb-5">
            <div className="flex-1">
              <label className="block text-sm font-medium text-secondary" style={{ marginBottom: 6 }}>Rate (₹/sqft)</label>
              <input required type="number" value={quoteData.rate} 
                onChange={e => {
                  const newRate = e.target.value;
                  const newAgmt = newRate ? String(Number(newRate) * selectedUnit.carpetAreaSqft) : '';
                  setQuoteData({...quoteData, rate: newRate, agreementValue: newAgmt});
                }} 
                className="w-full text-primary" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', transition: 'border 0.2s', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = 'var(--color-primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>

            <div className="flex-1">
              <label className="block text-sm font-medium text-secondary" style={{ marginBottom: 6 }}>Agreement Value (₹)</label>
              <input required type="number" value={quoteData.agreementValue} 
                onChange={e => {
                  const newAgmt = e.target.value;
                  const newRate = newAgmt ? String(Math.round(Number(newAgmt) / selectedUnit.carpetAreaSqft)) : '';
                  setQuoteData({...quoteData, agreementValue: newAgmt, rate: newRate});
                }} 
                className="w-full text-primary" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', transition: 'border 0.2s', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = 'var(--color-primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>
          </div>

          <label className="flex items-center text-base mb-6 cursor-pointer" style={{ gap: 10, padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
            <input type="checkbox" checked={quoteData.parkingIncluded} onChange={e => setQuoteData({...quoteData, parkingIncluded: e.target.checked})} style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }} />
            <span className="font-medium text-primary">Include Parking</span> 
            <span className="text-muted">(+₹{(projectParkingCharge / 100000).toFixed(1)}L)</span>
          </label>

          {/* Live Calculation Preview */}
          {Number(quoteData.agreementValue) > 0 && (
            <div className="text-base p-4 mb-5" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div className="flex justify-between" style={{ marginBottom: 6 }}>
                <span className="text-muted">Agreement Value</span>
                <span>{formatRupees(quoteData.agreementValue)}</span>
              </div>
              {quoteData.parkingIncluded && (
                <div className="flex justify-between" style={{ marginBottom: 6 }}>
                  <span className="text-muted">Parking Charges</span>
                  <span>{formatRupees(projectParkingCharge)}</span>
                </div>
              )}
              <div className="flex justify-between" style={{ marginBottom: 6 }}>
                <span className="text-muted">Stamp Duty (6%)</span>
                <span>₹{(Number(quoteData.agreementValue) * 0.06).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between" style={{ marginBottom: 6 }}>
                <span className="text-muted">GST (5%)</span>
                <span>₹{(Number(quoteData.agreementValue) * 0.05).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between mb-3">
                <span className="text-muted">Registration</span>
                <span>₹{(quoteData.parkingIncluded ? 50000 : 30000).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between font-semibold text-primary pt-3 text-md" style={{ borderTop: '1px solid var(--border-color)' }}>
                <span>Total Cost</span>
                <span>₹{(Number(quoteData.agreementValue) + (Number(quoteData.agreementValue) * 0.11) + (quoteData.parkingIncluded ? 50000 + projectParkingCharge : 30000)).toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={() => setShowQuoteForm(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={isSubmittingQuote}>
              {isSubmittingQuote ? 'Generating PDF...' : 'Generate Quote'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
