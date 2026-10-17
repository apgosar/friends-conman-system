'use client'

import { useState, FormEvent } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { buildTitle, versionLabel } from '@/lib/version'
import { ERROR_KINDS } from '@/lib/errors'
import { Alert, Button, TextField } from '@/components/ui'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (res?.code === 'too_many_attempts') {
      setError(ERROR_KINDS.tooManyRequests.message)
    } else if (res?.error) {
      setError('Invalid email or password')
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">NC</div>
          <div>
            <div className="auth-logo-name">Neev CMS</div>
            <div className="auth-logo-sub">Property Management System</div>
          </div>
        </div>

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your account to continue</p>

        <form onSubmit={handleSubmit} className="flex dir-col gap-5">
          {error && <Alert variant="danger">{error}</Alert>}

          <TextField id="email" label="Email address" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" required autoFocus />
          <TextField id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />

          <Button type="submit" variant="primary" size="lg" block loading={loading} id="login-submit-btn">
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
        <div title={buildTitle()} className="mt-5 text-center text-xs text-muted">{versionLabel()}</div>
      </div>
    </div>
  )
}
