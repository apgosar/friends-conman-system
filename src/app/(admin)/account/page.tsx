'use client'

import { useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import TopNav from '@/components/layout/TopNav'
import { PASSWORD_RULES } from '@/lib/password-rules'
import { ROLE_LABELS, normalizeRole } from '@/lib/roles'
import { Alert, Button, Card, TextField } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'

export default function AccountPage() {
  const { data: session } = useSession()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) return setError('The two new passwords do not match')
    setBusy(true)
    try {
      await fetchJson('/api/account/password', jsonRequest('POST', { currentPassword, newPassword }))
      setDone(true)
      // Every session ends when the password changes; go to the sign-in page rather than wait for a failed request
      setTimeout(() => signOut({ callbackUrl: '/login' }), 2500)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TopNav title="My Account" subtitle="Your sign-in details" />
      <div className="admin-content">
        <Card className="max-w-md">
          {session?.user && (
            <div className="mb-5">
              <div className="font-semibold">{session.user.name}</div>
              <div className="text-muted text-base">{session.user.email} · {ROLE_LABELS[normalizeRole(session.user.role)]}</div>
            </div>
          )}

          <h2 className="card-title mb-3">Change password</h2>
          {done ? (
            <Alert variant="success">Password changed. You are being signed out so you can sign in with the new one…</Alert>
          ) : (
            <form onSubmit={handleSubmit} className="flex dir-col gap-4">
              {error && <Alert variant="danger">{error}</Alert>}
              <TextField label="Current password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              <TextField label="New password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} hint={PASSWORD_RULES} required />
              <TextField label="Confirm new password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              <Button type="submit" variant="primary" loading={busy}>Change password</Button>
            </form>
          )}
        </Card>
      </div>
    </>
  )
}
