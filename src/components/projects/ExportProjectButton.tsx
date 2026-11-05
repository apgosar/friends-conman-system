'use client'

import { useState } from 'react'
import { Alert, Button, Modal, TextField, useToast } from '@/components/ui'
import { downloadFromApi, errorMessage, jsonRequest } from '@/lib/client/api'
import { MIN_PASSPHRASE_LENGTH, PACKAGE_EXTENSION } from '@/lib/project-transfer/constants'

/**
 * Super Admin only. Downloads the whole project as one file, locked with a passphrase, to be imported on another server
 * (Projects → Import project). The passphrase goes in the request body, never in a link.
 */
export default function ExportProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const close = () => { setOpen(false); setPassphrase(''); setAgain(''); setError('') }
  const tooShort = passphrase.length > 0 && passphrase.length < MIN_PASSPHRASE_LENGTH
  const mismatch = again.length > 0 && again !== passphrase
  const ready = passphrase.length >= MIN_PASSPHRASE_LENGTH && again === passphrase

  const run = async () => {
    setBusy(true)
    setError('')
    try {
      const name = await downloadFromApi(`/api/projects/${projectId}/export`, jsonRequest('POST', { passphrase }), `neev-project${PACKAGE_EXTENSION}`)
      toast.success(`Downloaded ${name}`)
      close()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Export Project</Button>
      {open && (
        <Modal
          title={`Export ${projectName}`}
          size="sm"
          dismissible={!busy}
          onClose={close}
          footer={
            <>
              <Button onClick={close} disabled={busy}>Cancel</Button>
              <Button variant="primary" loading={busy} disabled={!ready} onClick={run}>Download file</Button>
            </>
          }
        >
          <form className="flex dir-col gap-3" onSubmit={(e) => { e.preventDefault(); if (ready && !busy) void run() }}>
            <p className="m-0">
              Saves this project as one file you can import on another server: the building, sales, buyers, payments, documents and the files kept with them.
              Old messages and the activity history stay on this server.
            </p>
            <Alert variant="warning" title="The file holds buyers' PAN and Aadhaar numbers">
              It is locked with the passphrase below. Nobody, including us, can open it without that passphrase, so keep it safe and send it separately from the file.
            </Alert>
            <TextField label="Passphrase" type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)}
              hint={`At least ${MIN_PASSPHRASE_LENGTH} characters`} error={tooShort ? `Use at least ${MIN_PASSPHRASE_LENGTH} characters` : undefined} />
            <TextField label="Type the passphrase again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)}
              error={mismatch ? 'The two passphrases are different' : undefined} />
            {error && <Alert variant="danger">{error}</Alert>}
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </form>
        </Modal>
      )}
    </>
  )
}
