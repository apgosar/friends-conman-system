import React from 'react'

export function QuoteModal({
  showQuoteForm,
  setShowQuoteForm,
  selectedUnit,
  quoteData,
  setQuoteData,
  handleGenerateQuote,
  isSubmittingQuote,
  projectParkingCharge,
}: any) {
  if (!showQuoteForm || !selectedUnit) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setShowQuoteForm(false)} />
      <div style={{ position: 'relative', background: 'var(--bg-card)', width: '100%', maxWidth: 500, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Create Quote</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Unit {selectedUnit.unitNumber} • {selectedUnit.carpetAreaSqft} sqft</p>
          </div>
          <button onClick={() => setShowQuoteForm(false)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', transition: 'background 0.2s' }}>×</button>
        </div>
        
        <form onSubmit={handleGenerateQuote} style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Customer Name</label>
              <input required type="text" value={quoteData.customerName} onChange={e => setQuoteData({...quoteData, customerName: e.target.value})} 
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', transition: 'border 0.2s', boxSizing: 'border-box' }} 
                onFocus={e => e.target.style.borderColor = 'var(--color-primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>
            
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Mobile Number</label>
              <input required type="tel" pattern="[0-9]{10}" title="Please enter a valid 10-digit mobile number" maxLength={10} minLength={10} 
                value={quoteData.mobileNumber} onChange={e => setQuoteData({...quoteData, mobileNumber: e.target.value.replace(/\D/g, '')})} 
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${quoteData.mobileNumber && quoteData.mobileNumber.length !== 10 ? 'var(--color-danger, #ef4444)' : 'var(--border-color)'}`, background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', transition: 'border 0.2s', boxSizing: 'border-box' }}
                onFocus={e => { if (quoteData.mobileNumber.length === 10 || !quoteData.mobileNumber) e.target.style.borderColor = 'var(--color-primary)' }} 
                onBlur={e => { if (quoteData.mobileNumber.length === 10 || !quoteData.mobileNumber) e.target.style.borderColor = 'var(--border-color)' }}
              />
              {quoteData.mobileNumber && quoteData.mobileNumber.length !== 10 && (
                <div style={{ color: 'var(--color-danger, #ef4444)', fontSize: '0.75rem', marginTop: 4 }}>⚠ Must be exactly 10 digits</div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Rate (₹/sqft)</label>
              <input required type="number" value={quoteData.rate} 
                onChange={e => {
                  const newRate = e.target.value;
                  const newAgmt = newRate ? String(Number(newRate) * selectedUnit.carpetAreaSqft) : '';
                  setQuoteData({...quoteData, rate: newRate, agreementValue: newAgmt});
                }} 
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', transition: 'border 0.2s', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = 'var(--color-primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Agreement Value (₹)</label>
              <input required type="number" value={quoteData.agreementValue} 
                onChange={e => {
                  const newAgmt = e.target.value;
                  const newRate = newAgmt ? String(Math.round(Number(newAgmt) / selectedUnit.carpetAreaSqft)) : '';
                  setQuoteData({...quoteData, agreementValue: newAgmt, rate: newRate});
                }} 
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', transition: 'border 0.2s', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = 'var(--color-primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.875rem', marginBottom: 24, cursor: 'pointer', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
            <input type="checkbox" checked={quoteData.parkingIncluded} onChange={e => setQuoteData({...quoteData, parkingIncluded: e.target.checked})} style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }} />
            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Include Parking</span> 
            <span style={{ color: 'var(--text-muted)' }}>(+₹{(projectParkingCharge / 100000).toFixed(1)}L)</span>
          </label>

          {/* Live Calculation Preview */}
          {Number(quoteData.agreementValue) > 0 && (
            <div style={{ fontSize: '0.875rem', background: 'var(--bg-surface)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 20, border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>Agreement Value</span>
                <span>₹{Number(quoteData.agreementValue).toLocaleString('en-IN')}</span>
              </div>
              {quoteData.parkingIncluded && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Parking Charges</span>
                  <span>₹{projectParkingCharge.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>Stamp Duty (6%)</span>
                <span>₹{(Number(quoteData.agreementValue) * 0.06).toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>GST (5%)</span>
                <span>₹{(Number(quoteData.agreementValue) * 0.05).toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Registration</span>
                <span>₹{(quoteData.parkingIncluded ? 50000 : 30000).toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)', paddingTop: 12, fontSize: '1rem' }}>
                <span>Total Cost</span>
                <span>₹{(Number(quoteData.agreementValue) + (Number(quoteData.agreementValue) * 0.11) + (quoteData.parkingIncluded ? 50000 + projectParkingCharge : 30000)).toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowQuoteForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmittingQuote}>
              {isSubmittingQuote ? 'Generating PDF...' : 'Generate Quote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
