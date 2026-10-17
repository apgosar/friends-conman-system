'use client'

import { useState, useEffect, useCallback } from 'react'
import TopNav from '@/components/layout/TopNav'
import { Alert, Badge, Button, EmptyRow, Modal, PageHeader, Select, SelectField, Table, Td, TextField, useConfirm, useToast } from '@/components/ui'
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from '@/lib/roles'
import { PASSWORD_RULES } from '@/lib/password-rules'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { formatDate } from '@/lib/format'

interface UserRow { id: string; name: string; email: string; role: Role; isActive: boolean; createdAt: string }

export default function UsersPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // New user dialog
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('SALES')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Reset password dialog
  const [resetFor, setResetFor] = useState<{ id: string; name: string } | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetting, setResetting] = useState(false)

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetchJson<{ data: UserRow[] }>('/api/users')
      setUsers(res.data)
      setLoadError('')
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError('')
    try {
      await fetchJson('/api/users', jsonRequest('POST', { name, email, role, password }))
      setShowCreate(false)
      setName(''); setEmail(''); setRole('SALES'); setPassword('')
      toast.success('User created')
      fetchUsers()
    } catch (err) {
      setCreateError(errorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function patchUser(id: string, body: Record<string, unknown>, done: string) {
    try {
      await fetchJson(`/api/users/${id}`, jsonRequest('PATCH', body))
      toast.success(done)
    } catch (err) {
      toast.error(errorMessage(err))
    }
    fetchUsers()
  }

  async function toggleStatus(user: UserRow) {
    const suspending = user.isActive
    const ok = await confirm({
      title: suspending ? 'Suspend user' : 'Activate user',
      message: suspending ? `Suspend ${user.name}? They will be signed out immediately.` : `Activate ${user.name}?`,
      confirmLabel: suspending ? 'Suspend' : 'Activate',
      danger: suspending,
    })
    if (ok) await patchUser(user.id, { isActive: !user.isActive }, suspending ? 'User suspended' : 'User activated')
  }

  async function changeRole(user: UserRow, newRole: Role) {
    const ok = await confirm({
      title: 'Change role',
      message: `Change ${user.name} to ${ROLE_LABELS[newRole]}? They will be signed out, and the new role applies when they sign in again.`,
      confirmLabel: 'Change role',
    })
    if (ok) await patchUser(user.id, { role: newRole }, 'Role changed')
    else fetchUsers() // put the dropdown back
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!resetFor) return
    setResetting(true)
    setResetError('')
    try {
      await fetchJson(`/api/users/${resetFor.id}/password`, jsonRequest('POST', { newPassword }))
      setResetFor(null)
      setNewPassword('')
      toast.success('Password reset. They are signed out everywhere')
    } catch (err) {
      setResetError(errorMessage(err))
    } finally {
      setResetting(false)
    }
  }

  return (
    <>
      <TopNav title="User Management" subtitle="Manage team members and access roles" />
      <div className="admin-content">
        <PageHeader
          title="Users"
          subtitle={`${users.length} team members`}
          actions={<Button variant="primary" onClick={() => setShowCreate(true)}>+ Add User</Button>}
        />

        {loadError && <Alert variant="danger" className="mb-4">{loadError}</Alert>}

        <div className="card p-0 overflow-hidden">
          <Table flush stack>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={6}>Loading…</EmptyRow>
              ) : users.length === 0 ? (
                <EmptyRow colSpan={6}>No users found</EmptyRow>
              ) : users.map((user) => (
                <tr key={user.id}>
                  <Td label="Name" className="font-medium">{user.name}</Td>
                  <Td label="Email" className="text-muted">{user.email}</Td>
                  <Td label="Role">
                    <Select small className="w-auto" aria-label={`Role of ${user.name}`} value={user.role} onChange={(e) => changeRole(user, e.target.value as Role)}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </Select>
                  </Td>
                  <Td label="Status"><Badge variant={user.isActive ? 'success' : 'danger'}>{user.isActive ? 'Active' : 'Suspended'}</Badge></Td>
                  <Td label="Joined" className="text-sm text-muted">{formatDate(user.createdAt)}</Td>
                  <Td label="" className="nowrap">
                    <Button size="sm" variant={user.isActive ? 'ghost' : 'primary'} onClick={() => toggleStatus(user)}>{user.isActive ? 'Suspend' : 'Activate'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setResetFor({ id: user.id, name: user.name }); setNewPassword(''); setResetError('') }}>Reset password</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>

      {showCreate && (
        <Modal
          title="Add New User"
          size="sm"
          onClose={() => setShowCreate(false)}
          dismissible={!creating}
          footer={
            <>
              <Button onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" form="create-user-form" variant="primary" loading={creating}>Create User</Button>
            </>
          }
        >
          <form id="create-user-form" className="stack" onSubmit={handleCreateUser}>
            {createError && <Alert variant="danger">{createError}</Alert>}
            <TextField label="Full Name" required value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Email Address" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <SelectField label="Role" required value={role} onChange={(e) => setRole(e.target.value as Role)} hint={ROLE_DESCRIPTIONS[role]}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </SelectField>
            <TextField label="Temporary Password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} hint={PASSWORD_RULES} />
          </form>
        </Modal>
      )}

      {resetFor && (
        <Modal
          title="Reset password"
          subtitle={`Set a new password for ${resetFor.name}. They are signed out everywhere.`}
          size="sm"
          onClose={() => setResetFor(null)}
          dismissible={!resetting}
          footer={
            <>
              <Button onClick={() => setResetFor(null)}>Cancel</Button>
              <Button type="submit" form="reset-password-form" variant="primary" loading={resetting}>Set password</Button>
            </>
          }
        >
          <form id="reset-password-form" className="stack" onSubmit={handleResetPassword}>
            {resetError && <Alert variant="danger">{resetError}</Alert>}
            <TextField label="New password" type="password" autoComplete="new-password" required autoFocus value={newPassword} onChange={(e) => setNewPassword(e.target.value)} hint={PASSWORD_RULES} />
          </form>
        </Modal>
      )}
    </>
  )
}
