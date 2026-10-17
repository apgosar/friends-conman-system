'use client'

import { useState, useEffect, useCallback } from 'react'
import TopNav from '@/components/layout/TopNav'
import { Modal } from '@/components/structure/ui'
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from '@/lib/roles'
import { PASSWORD_RULES } from '@/lib/password-rules'

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  
  // New User Form
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('SALES')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [pageError, setPageError] = useState('')
  const [resetFor, setResetFor] = useState<{ id: string; name: string } | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetBusy, setResetBusy] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/users')
    const data = await res.json()
    if (data.success) {
      setUsers(data.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, password })
      })
      const data = await res.json()
      if (data.success) {
        setShowModal(false)
        setName(''); setEmail(''); setRole('SALES'); setPassword('')
        fetchUsers()
      } else {
        setErrorMsg(data.error)
      }
    } catch (err: any) {
      setErrorMsg(err.message)
    }
    setSubmitting(false)
  }

  async function patchUser(id: string, body: Record<string, unknown>) {
    setPageError('')
    const res = await fetch(`/api/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) setPageError(json.error || 'Could not update the user')
    fetchUsers()
  }

  async function toggleStatus(id: string, currentStatus: boolean) {
    if (!confirm(`Are you sure you want to ${currentStatus ? 'suspend' : 'activate'} this user? ${currentStatus ? 'They will be signed out immediately.' : ''}`)) return
    await patchUser(id, { isActive: !currentStatus })
  }

  async function changeRole(id: string, newRole: string) {
    if (!confirm(`Change role to ${ROLE_LABELS[newRole as Role] ?? newRole}? They will be signed out and the new role applies when they sign in again.`)) return
    await patchUser(id, { role: newRole })
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!resetFor) return
    setResetBusy(true)
    setResetError('')
    const res = await fetch(`/api/users/${resetFor.id}/password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword }) })
    const json = await res.json().catch(() => ({}))
    setResetBusy(false)
    if (!res.ok) return setResetError(json.error || 'Could not reset the password')
    setResetFor(null)
    setNewPassword('')
  }

  return (
    <>
      <TopNav title="User Management" subtitle="Manage team members and access roles" />
      <div className="admin-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Users</h1>
            <p className="page-subtitle">{users.length} team members</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Add User
          </button>
        </div>

        {pageError && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{pageError}</div>}

        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper" style={{ border: 'none', margin: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading…</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No users found</td></tr>
                ) : users.map((user) => (
                  <tr key={user.id} className="hover-row">
                    <td style={{ fontWeight: 500 }}>{user.name}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{user.email}</td>
                    <td>
                      <select 
                        value={user.role} 
                        onChange={(e) => changeRole(user.id, e.target.value)}
                        className="form-input"
                        style={{ padding: '4px 8px', height: 'auto', fontSize: '0.8125rem', width: 'auto' }}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                    <td>
                      <span className={`badge ${user.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {user.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      {new Date(user.createdAt).toLocaleDateString('en-IN')}
                    </td>
                    <td>
                      <button 
                        className={`btn btn-sm ${user.isActive ? 'btn-ghost' : 'btn-primary'}`}
                        onClick={() => toggleStatus(user.id, user.isActive)}
                      >
                        {user.isActive ? 'Suspend' : 'Activate'}
                      </button>
                      <button className="btn btn-sm btn-ghost" style={{ marginLeft: 6 }} onClick={() => { setResetFor({ id: user.id, name: user.name }); setNewPassword(''); setResetError('') }}>
                        Reset password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={() => setShowModal(false)} />
          <div style={{ position: 'relative', background: 'var(--bg-card)', width: '100%', maxWidth: 400, borderRadius: 12, boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Add New User</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' }}>×</button>
            </div>
            <form onSubmit={handleCreateUser} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}
              <div>
                <label className="form-label">Full Name</label>
                <input type="text" className="form-input" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div>
                <label className="form-label">Email Address</label>
                <input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="form-label">Role</label>
                <select className="form-input" value={role} onChange={e => setRole(e.target.value as Role)} required>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <div className="form-hint" style={{ marginTop: 4 }}>{ROLE_DESCRIPTIONS[role]}</div>
              </div>
              <div>
                <label className="form-label">Temporary Password</label>
                <input type="password" autoComplete="new-password" className="form-input" value={password} onChange={e => setPassword(e.target.value)} required />
                <div className="form-hint" style={{ marginTop: 4 }}>{PASSWORD_RULES}</div>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 12 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Saving...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetFor && (
        <Modal title="Reset password" subtitle={`Set a new password for ${resetFor.name}. They are signed out everywhere.`} onClose={() => setResetFor(null)} maxWidth={420}>
          <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {resetError && <div className="alert alert-danger">{resetError}</div>}
            <div>
              <label className="form-label" htmlFor="reset-password">New password</label>
              <input id="reset-password" type="password" autoComplete="new-password" className="form-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoFocus />
              <div className="form-hint" style={{ marginTop: 4 }}>{PASSWORD_RULES}</div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setResetFor(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={resetBusy}>{resetBusy ? 'Saving…' : 'Set password'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
