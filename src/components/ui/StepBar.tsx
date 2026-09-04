import React from 'react'

export function StepBar({ step, steps }: { step: number; steps: string[] }) {
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
