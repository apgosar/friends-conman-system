'use client'

import { useState } from 'react'
import { Button } from '@/components/ui'

export default function TemplateHtmlPreview({ html }: { html: string }) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <Button 
        type="button" 
        variant="ghost" size="sm"
        onClick={() => setShowModal(true)}
      >
        View HTML
      </Button>

      {showModal && (
        <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setShowModal(false)} />
          <div className="relative w-full overflow-hidden flex dir-col" style={{ background: 'var(--bg-card)', maxWidth: 800, maxHeight: '90vh', borderRadius: '12px', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)' }}>
            
            <div className="flex justify-between items-center" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
              <h3 className="text-xl font-semibold m-0 text-primary">HTML Template Preview</h3>
              <button onClick={() => setShowModal(false)} className="flex items-center justify-center text-muted cursor-pointer" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, fontSize: '1.2rem', transition: 'background 0.2s' }}>×</button>
            </div>
            
            <div className="flex-1 p-6" style={{ overflowY: 'auto', background: '#fff' }}>
              <div dangerouslySetInnerHTML={{ __html: html }} style={{ color: '#000' }} />
            </div>

            <div className="flex justify-end" style={{ padding: '20px 24px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
              <Button type="button" variant="primary" style={{ borderRadius: '8px', padding: '8px 24px' }} onClick={() => setShowModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
