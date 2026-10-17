'use client'

import { useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import TopNav from '@/components/layout/TopNav'
import { PASSWORD_RULES } from '@/lib/password-rules'
import { ROLE_LABELS, normalizeRole } from '@/lib/roles'
import { Button, Input } from '@/components/ui'

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
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return setError(json.error || 'Could not change the password')
      setDone(true)
      // Every session ends when the password changes; go to the sign-in page rather than wait for a failed request
      setTimeout(() => signOut({ callbackUrl: '/login' }), 2500)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TopNav title="My Account" subtitle="Your sign-in details" />
      <div className="admin-content">
        <div className="card" style={{ maxWidth: 480 }}>
          {session?.user && (
            <div className="mb-5">
              <div className="font-semibold">{session.user.name}</div>
              <div className="text-muted text-base">{session.user.email} · {ROLE_LABELS[normalizeRole(session.user.role)]}</div>
            </div>
          )}

          <h2 className="card-title mb-3">Change password</h2>
          {done ? (
            <div className="alert alert-success">Password changed. You are being signed out so you can sign in with the new one…</div>
          ) : (
            <form onSubmit={handleSubmit} className="flex dir-col gap-4">
              {error && <div className="alert alert-danger">{error}</div>}
              <div className="form-group">
                <label className="form-label" htmlFor="current-password">Current password</label>
                <Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="new-password">New password</label>
                <Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                <span className="form-hint">{PASSWORD_RULES}</span>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="confirm-password">Confirm new password</label>
                <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              </div>
              <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Button>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
