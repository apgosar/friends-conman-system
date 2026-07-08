'use client'

import { useState } from 'react'

export default function TemplateHtmlPreview({ html }: { html: string }) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <button 
        type="button" 
        className="btn btn-ghost btn-sm"
        onClick={() => setShowModal(true)}
      >
        View HTML
      </button>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setShowModal(false)} />
          <div style={{ position: 'relative', background: 'var(--bg-card)', width: '100%', maxWidth: 800, maxHeight: '90vh', borderRadius: '12px', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>HTML Template Preview</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', transition: 'background 0.2s' }}>×</button>
            </div>
            
            <div style={{ 
              flex: 1, overflowY: 'auto', padding: 24, background: '#fff' // HTML is best viewed on white background
            }}>
              <div dangerouslySetInnerHTML={{ __html: html }} style={{ color: '#000' }} />
            </div>

            <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-surface)', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-primary" style={{ borderRadius: '8px', padding: '8px 24px' }} onClick={() => setShowModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
