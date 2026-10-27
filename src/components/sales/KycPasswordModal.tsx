'use client'

import { useState } from 'react'
import { Alert, Button, Modal, TextField } from '@/components/ui'

/**
 * Asks for the password of a locked PDF (an e-Aadhaar or e-PAN). The password goes to the server with the file for this one
 * reading and is not kept anywhere.
 */
export default function KycPasswordModal({ docType, fileName, wrong, busy, onSubmit, onCancel }: {
  docType: 'PAN' | 'AADHAAR'
  fileName: string
  wrong: boolean
  busy: boolean
  onSubmit: (password: string) => void
  onCancel: () => void
}) {
  const [password, setPassword] = useState('')

  return (
    <Modal
      title="This file is password protected"
      subtitle={fileName}
      dismissible={!busy}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="submit" form="kyc-password-form" variant="primary" loading={busy} disabled={!password}>Unlock and read</Button>
        </>
      }
    >
      <form id="kyc-password-form" className="flex dir-col gap-4" onSubmit={(e) => { e.preventDefault(); if (password) onSubmit(password) }}>
        {wrong && <Alert variant="danger">That password is not correct. Try again</Alert>}
        <TextField
          label="Password"
          type="password"
          autoComplete="off"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={docType === 'AADHAAR'
            ? 'An e-Aadhaar PDF opens with the first 4 letters of the name in capitals followed by the year of birth, for example RAJE1990'
            : 'An e-PAN PDF usually opens with the date of birth as DDMMYYYY, for example 05071990'}
        />
      </form>
    </Modal>
  )
}
