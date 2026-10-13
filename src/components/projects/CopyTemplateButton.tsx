'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CopyTemplateButton({ projectId, templateId, projects }: {
  projectId: string
  templateId: string
  projects: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ project: string; activated: boolean } | null>(null)

  const close = () => { setOpen(false); setDone(null); setError(''); setTarget('') }

  const copy = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/templates/${templateId}/copy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetProjectId: target }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not copy template')
      setDone({ project: json.targetProjectName, activated: json.activated })
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" disabled={projects.length === 0} title={projects.length === 0 ? 'No other projects to copy to' : 'Copy to another project'} onClick={() => setOpen(true)}>
        Copy
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={close} />
          <div style={{ position: 'relative', background: 'var(--bg-card)', width: '100%', maxWidth: 440, borderRadius: 12, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)', fontWeight: 600 }}>Copy template to another project</div>
            <div style={{ padding: 20 }}>
              {done ? (
                <p style={{ margin: 0, fontSize: '0.9rem' }}>
                  Copied to <b>{done.project}</b>.{' '}
                  {done.activated
                    ? 'It had no template of this type, so the copy is now its active template.'
                    : 'That project already has an active template of this type, so the copy was added as an inactive version. Activate it there when you are ready.'}
                </p>
              ) : (
                <>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Target project</label>
                  <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                    <option value="">— Select a project —</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '10px 0 0' }}>
                    The copy becomes active only if that project has no template of this type yet. It never replaces a live one.
                  </p>
                  {error && <div role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginTop: 10 }}>{error}</div>}
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button type="button" className="btn btn-secondary" onClick={close}>{done ? 'Close' : 'Cancel'}</button>
                {!done && <button type="button" className="btn btn-primary" disabled={!target || busy} onClick={copy}>{busy ? 'Copying…' : 'Copy'}</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
