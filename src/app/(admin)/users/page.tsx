'use client'

import { useState, useEffect, useCallback } from 'react'
import TopNav from '@/components/layout/TopNav'
import { Modal } from '@/components/structure/ui'
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from '@/lib/roles'
import { PASSWORD_RULES } from '@/lib/password-rules'
import { Button, Input } from '@/components/ui'
import { formatDate } from '@/lib/format'

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
          <Button variant="primary" onClick={() => setShowModal(true)}>
            + Add User
          </Button>
        </div>

        {pageError && <div className="alert alert-danger mb-4">{pageError}</div>}

        <div className="card p-0">
          <div className="table-wrapper m-0" style={{ border: 'none' }}>
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
                  <tr><td colSpan={6} className="text-center p-10 text-muted">Loading…</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={6} className="text-center p-10 text-muted">No users found</td></tr>
                ) : users.map((user) => (
                  <tr key={user.id} className="hover-row">
                    <td className="font-medium">{user.name}</td>
                    <td className="text-muted">{user.email}</td>
                    <td>
                      <select 
                        value={user.role} 
                        onChange={(e) => changeRole(user.id, e.target.value)}
                        className="form-input text-sm"
                        style={{ padding: '4px 8px', height: 'auto', width: 'auto' }}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                    <td>
                      <span className={`badge ${user.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {user.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="text-sm text-muted">
                      {formatDate(user.createdAt)}
                    </td>
                    <td>
                      <button 
                        className={`btn btn-sm ${user.isActive ? 'btn-ghost' : 'btn-primary'}`}
                        onClick={() => toggleStatus(user.id, user.isActive)}
                      >
                        {user.isActive ? 'Suspend' : 'Activate'}
                      </button>
                      <Button variant="ghost" size="sm" style={{ marginLeft: 6 }} onClick={() => { setResetFor({ id: user.id, name: user.name }); setNewPassword(''); setResetError('') }}>
                        Reset password
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={() => setShowModal(false)} />
          <div className="relative w-full overflow-hidden" style={{ background: 'var(--bg-card)', maxWidth: 400, borderRadius: 12, boxShadow: 'var(--shadow-xl)' }}>
            <div className="flex justify-between items-center" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="m-0">Add New User</h3>
              <button onClick={() => setShowModal(false)} className="cursor-pointer text-muted" style={{ background: 'none', border: 'none', fontSize: '1.2rem' }}>×</button>
            </div>
            <form onSubmit={handleCreateUser} className="p-6 flex dir-col gap-4">
              {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}
              <div>
                <label className="form-label">Full Name</label>
                <Input type="text" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div>
                <label className="form-label">Email Address</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="form-label">Role</label>
                <select className="form-input" value={role} onChange={e => setRole(e.target.value as Role)} required>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <div className="form-hint mt-1">{ROLE_DESCRIPTIONS[role]}</div>
              </div>
              <div>
                <label className="form-label">Temporary Password</label>
                <Input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required />
                <div className="form-hint mt-1">{PASSWORD_RULES}</div>
              </div>
              <div className="mt-2 flex gap-3">
                <Button type="button" className="flex-1" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit" className="flex-1" variant="primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Create User'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetFor && (
        <Modal title="Reset password" subtitle={`Set a new password for ${resetFor.name}. They are signed out everywhere.`} onClose={() => setResetFor(null)} maxWidth={420}>
          <form onSubmit={handleResetPassword} className="flex dir-col gap-4">
            {resetError && <div className="alert alert-danger">{resetError}</div>}
            <div>
              <label className="form-label" htmlFor="reset-password">New password</label>
              <Input id="reset-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoFocus />
              <div className="form-hint mt-1">{PASSWORD_RULES}</div>
            </div>
            <div className="flex gap-3">
              <Button type="button" className="flex-1" variant="secondary" onClick={() => setResetFor(null)}>Cancel</Button>
              <Button type="submit" className="flex-1" variant="primary" disabled={resetBusy}>{resetBusy ? 'Saving…' : 'Set password'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
