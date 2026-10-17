'use client'

import { useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import TopNav from '@/components/layout/TopNav'
import { PASSWORD_RULES } from '@/lib/password-rules'
import { ROLE_LABELS, normalizeRole } from '@/lib/roles'

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
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600 }}>{session.user.name}</div>
              <div className="text-muted text-base">{session.user.email} · {ROLE_LABELS[normalizeRole(session.user.role)]}</div>
            </div>
          )}

          <h2 className="card-title" style={{ marginBottom: 12 }}>Change password</h2>
          {done ? (
            <div className="alert alert-success">Password changed. You are being signed out so you can sign in with the new one…</div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {error && <div className="alert alert-danger">{error}</div>}
              <div className="form-group">
                <label className="form-label" htmlFor="current-password">Current password</label>
                <input id="current-password" type="password" autoComplete="current-password" className="form-input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="new-password">New password</label>
                <input id="new-password" type="password" autoComplete="new-password" className="form-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                <span className="form-hint">{PASSWORD_RULES}</span>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="confirm-password">Confirm new password</label>
                <input id="confirm-password" type="password" autoComplete="new-password" className="form-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
