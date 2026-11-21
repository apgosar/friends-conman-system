'use client'

import { useState, FormEvent } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { buildTitle, versionLabel } from '@/lib/version'
import { ERROR_KINDS } from '@/lib/errors'
import { Alert, Button, TextField } from '@/components/ui'

/** `demo` is set only on a deployment made for people to try (see lib/demo-login.ts): the form then starts filled in. */
export default function LoginForm({ demo }: { demo: { email: string; password: string } | null }) {
  const router = useRouter()
  const [email, setEmail] = useState(demo?.email ?? '')
  const [password, setPassword] = useState(demo?.password ?? '')
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

        <h1 className="auth-title">{demo ? 'Try Neev CMS' : 'Welcome back'}</h1>
        <p className="auth-subtitle">{demo ? 'Demo access for the Startup Buildathon judges' : 'Sign in to your account to continue'}</p>

        <form onSubmit={handleSubmit} className="flex dir-col gap-5">
          {demo && <Alert variant="info">The demo login is filled in. Press Sign In. Everything here is made-up demo data.</Alert>}
          {error && <Alert variant="danger">{error}</Alert>}

          <TextField id="email" label="Email address" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" required autoFocus={!demo} />
          <TextField id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />

          <Button type="submit" variant="primary" size="lg" block loading={loading} id="login-submit-btn" autoFocus={!!demo}>
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
        <div title={buildTitle()} className="mt-5 text-center text-xs text-muted">{versionLabel()}</div>
      </div>
    </div>
  )
}
