'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Modal, SelectField } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'

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
      const json = await fetchJson(`/api/projects/${projectId}/templates/${templateId}/copy`, jsonRequest('POST', { targetProjectId: target }))
      setDone({ project: json.targetProjectName, activated: json.activated })
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" disabled={projects.length === 0} title={projects.length === 0 ? 'No other projects to copy to' : 'Copy to another project'} onClick={() => setOpen(true)}>
        Copy
      </Button>

      {open && (
        <Modal
          title="Copy template to another project"
          size="sm"
          dismissible={!busy}
          onClose={close}
          footer={
            <>
              <Button onClick={close}>{done ? 'Close' : 'Cancel'}</Button>
              {!done && <Button variant="primary" loading={busy} disabled={!target} onClick={copy}>Copy</Button>}
            </>
          }
        >
          {done ? (
            <p className="m-0">
              Copied to <b>{done.project}</b>.{' '}
              {done.activated
                ? 'It had no template of this type, so the copy is now its active template.'
                : 'That project already has an active template of this type, so the copy was added as an inactive version. Activate it there when you are ready.'}
            </p>
          ) : (
            <div className="flex dir-col gap-3">
              <SelectField label="Target project" value={target} onChange={(e) => setTarget(e.target.value)} hint="The copy becomes active only if that project has no template of this type yet. It never replaces a live one.">
                <option value="">Select a project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </SelectField>
              {error && <Alert variant="danger">{error}</Alert>}
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
