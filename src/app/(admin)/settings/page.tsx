'use client'

import { useState } from 'react'
import TopNav from '@/components/layout/TopNav'
import { Button, ButtonLink, Input } from '@/components/ui'

type TestStatus = 'idle' | 'loading' | 'success' | 'error'

export default function SettingsPage() {
  // Email test
  const [testEmailTo, setTestEmailTo] = useState('')
  const [emailStatus, setEmailStatus] = useState<TestStatus>('idle')
  const [emailMsg, setEmailMsg] = useState('')

  // WhatsApp test
  const [testWaTo, setTestWaTo] = useState('')
  const [waStatus, setWaStatus] = useState<TestStatus>('idle')
  const [waMsg, setWaMsg] = useState('')

  async function handleTestEmail(e: React.FormEvent) {
    e.preventDefault()
    setEmailStatus('loading')
    setEmailMsg('')
    try {
      const res = await fetch('/api/settings/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmailTo }),
      })
      const data = await res.json()
      if (data.success) {
        setEmailStatus('success')
        setEmailMsg(`✅ Email sent! Message ID: ${data.messageId}`)
      } else {
        setEmailStatus('error')
        setEmailMsg(`❌ ${data.error}`)
      }
    } catch (err: any) {
      setEmailStatus('error')
      setEmailMsg(`❌ ${err.message}`)
    }
  }

  async function handleTestWhatsApp(e: React.FormEvent) {
    e.preventDefault()
    setWaStatus('loading')
    setWaMsg('')
    try {
      const res = await fetch('/api/settings/test-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testWaTo }),
      })
      const data = await res.json()
      if (data.success) {
        setWaStatus('success')
        setWaMsg(
          data.status === 'simulated'
            ? `⚡ Simulated (credentials not configured). Message ID: ${data.messageId}`
            : `✅ WhatsApp sent! Message ID: ${data.messageId}`
        )
      } else {
        setWaStatus('error')
        setWaMsg(`❌ ${data.error}`)
      }
    } catch (err: any) {
      setWaStatus('error')
      setWaMsg(`❌ ${err.message}`)
    }
  }

  return (
    <>
      <TopNav title="Settings" subtitle="Integration configuration and testing" />
      <div className="admin-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">Configure and test communication integrations</p>
          </div>
        </div>

        <div className="grid gap-6" style={{ maxWidth: 820 }}>

          {/* ── Email Integration ─────────────────────────────── */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">✉️ Email Integration (Gmail SMTP)</span>
              <span className={`badge ${process.env.NEXT_PUBLIC_EMAIL_CONFIGURED === 'true' ? 'badge-success' : 'badge-muted'}`}>
                Configured via .env.local
              </span>
            </div>

            <div style={{ padding: '0 0 20px' }}>
              <p className="text-secondary mb-5" style={{ fontSize: '0.9rem' }}>
                Emails are sent via Gmail SMTP using a Google App Password. Set the following in your{' '}
                <code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: 4 }}>.env.local</code> file:
              </p>

              <div className="text-success mb-5" style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '16px 20px', fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: 2 }}>
                <div><span className="text-muted"># Email (Gmail App Password)</span></div>
                <div>GMAIL_USER=<span className="text-warning">neevcms@gmail.com</span></div>
                <div>GMAIL_APP_PASSWORD=<span className="text-warning">xxxx-xxxx-xxxx-xxxx</span></div>
                <div>COMPANY_NAME=<span className="text-warning">Your Company Name</span></div>
              </div>

              <details className="mb-5">
                <summary className="cursor-pointer text-base text-secondary font-medium">
                  📖 How to create a Gmail App Password
                </summary>
                <ol className="mt-3 pl-5 text-base text-muted" style={{ lineHeight: 1.8 }}>
                  <li>Sign in to <strong>neevcms@gmail.com</strong></li>
                  <li>Go to <strong>Google Account → Security → 2-Step Verification</strong> (enable it first)</li>
                  <li>At the bottom, click <strong>App passwords</strong></li>
                  <li>Select App: <em>Mail</em>, Device: <em>Other</em> → type &quot;Neev CMS Server&quot;</li>
                  <li>Copy the 16-character password and paste it as <code>GMAIL_APP_PASSWORD</code></li>
                </ol>
              </details>

              <form onSubmit={handleTestEmail} className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="form-label">Send test email to</label>
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" variant="primary" disabled={emailStatus === 'loading'}>
                  {emailStatus === 'loading' ? '⏳ Sending…' : '📧 Send Test Email'}
                </Button>
              </form>
              {emailMsg && (
                <div className={`alert ${emailStatus === 'success' ? 'alert-success' : 'alert-danger'} mt-4 mt-3`}>
                  {emailMsg}
                </div>
              )}
            </div>
          </div>

          {/* ── WhatsApp Integration ──────────────────────────── */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">💬 WhatsApp Integration (Meta Cloud API)</span>
              <span className="badge badge-muted">Direct — No third party needed</span>
            </div>

            <div style={{ padding: '0 0 20px' }}>
              <p className="text-secondary mb-5" style={{ fontSize: '0.9rem' }}>
                Uses the <strong>official WhatsApp Business Cloud API</strong> by Meta — completely free to set up, 
                pay only per conversation beyond the free tier. No Gupshup or Wati needed.
              </p>

              <div className="text-success mb-5" style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '16px 20px', fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: 2 }}>
                <div><span className="text-muted"># WhatsApp Business Cloud API (Meta)</span></div>
                <div>WHATSAPP_PHONE_NUMBER_ID=<span className="text-warning">your_phone_number_id</span></div>
                <div>WHATSAPP_ACCESS_TOKEN=<span className="text-warning">your_permanent_access_token</span></div>
              </div>

              <details className="mb-5">
                <summary className="cursor-pointer text-base text-secondary font-medium">
                  📖 How to set up WhatsApp Cloud API (5 steps)
                </summary>
                <ol className="mt-3 pl-5 text-base text-muted" style={{ lineHeight: 2 }}>
                  <li>Go to <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-brand">developers.facebook.com</a> → Create App → Business type</li>
                  <li>Add the <strong>WhatsApp</strong> product to your app</li>
                  <li>In <strong>WhatsApp → API Setup</strong>, copy the <em>Phone Number ID</em> → paste as <code>WHATSAPP_PHONE_NUMBER_ID</code></li>
                  <li>Go to <strong>Business Settings → System Users</strong> → Create a system user → Generate a permanent token with <em>whatsapp_business_messaging</em> permission → paste as <code>WHATSAPP_ACCESS_TOKEN</code></li>
                  <li>Add and verify your <strong>business phone number</strong> (the number buyers will receive messages from)</li>
                </ol>
              </details>



              <form onSubmit={handleTestWhatsApp} className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="form-label">Send test WhatsApp to (with country code)</label>
                  <Input
                    type="tel"
                    placeholder="919876543210"
                    value={testWaTo}
                    onChange={(e) => setTestWaTo(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" variant="primary" disabled={waStatus === 'loading'}>
                  {waStatus === 'loading' ? '⏳ Sending…' : '💬 Send Test WhatsApp'}
                </Button>
              </form>
              {waMsg && (
                <div className={`alert ${waStatus === 'success' ? 'alert-success' : 'alert-danger'} mt-4 mt-3`}>
                  {waMsg}
                </div>
              )}
            </div>
          </div>

          {/* ── App Configuration ─────────────────────────────── */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">⚙️ App Configuration</span>
            </div>
            <div style={{ padding: '0 0 8px' }}>
              <p className="text-secondary mb-4" style={{ fontSize: '0.9rem' }}>
                Additional environment variables to configure in <code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: 4 }}>.env.local</code>:
              </p>
              <div className="text-success" style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '16px 20px', fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: 2 }}>
                <div><span className="text-muted"># Application URL (used in document links sent via WhatsApp)</span></div>
                <div>APP_URL=<span className="text-warning">https://your-production-domain.com</span></div>
                <div className="mt-2"><span className="text-muted"># Interest & Tax defaults</span></div>
                <div>INTEREST_RATE_PA=<span className="text-warning">12</span></div>
                <div>GST_RATE=<span className="text-warning">5</span></div>
                <div>TDS_THRESHOLD=<span className="text-warning">5000000</span></div>
              </div>
              <div className="mt-4 flex gap-3">
                <ButtonLink href="/communications" variant="secondary" size="sm">
                  💬 View Communications Inbox
                </ButtonLink>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
