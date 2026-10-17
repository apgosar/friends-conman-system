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
        <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={close} />
          <div className="relative w-full overflow-hidden" style={{ background: 'var(--bg-card)', maxWidth: 440, borderRadius: 12, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-xl)' }}>
            <div className="font-semibold" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>Copy template to another project</div>
            <div className="p-5">
              {done ? (
                <p className="m-0" style={{ fontSize: '0.9rem' }}>
                  Copied to <b>{done.project}</b>.{' '}
                  {done.activated
                    ? 'It had no template of this type, so the copy is now its active template.'
                    : 'That project already has an active template of this type, so the copy was added as an inactive version. Activate it there when you are ready.'}
                </p>
              ) : (
                <>
                  <label className="block text-sm font-medium text-secondary" style={{ marginBottom: 6 }}>Target project</label>
                  <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full text-primary" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
                    <option value="">— Select a project —</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <p className="text-xs text-muted" style={{ margin: '10px 0 0' }}>
                    The copy becomes active only if that project has no template of this type yet. It never replaces a live one.
                  </p>
                  {error && <div role="alert" className="text-danger text-sm" style={{ marginTop: 10 }}>{error}</div>}
                </>
              )}
              <div className="flex justify-end" style={{ gap: 10, marginTop: 18 }}>
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
