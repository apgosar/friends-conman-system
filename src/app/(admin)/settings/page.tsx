'use client'

import { useState } from 'react'
import TopNav from '@/components/layout/TopNav'
import Link from 'next/link'

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

        <div style={{ display: 'grid', gap: 24, maxWidth: 820 }}>

          {/* ── Email Integration ─────────────────────────────── */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">✉️ Email Integration (Gmail SMTP)</span>
              <span className={`badge ${process.env.NEXT_PUBLIC_EMAIL_CONFIGURED === 'true' ? 'badge-success' : 'badge-muted'}`}>
                Configured via .env.local
              </span>
            </div>

            <div style={{ padding: '0 0 20px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
                Emails are sent via Gmail SMTP using a Google App Password. Set the following in your{' '}
                <code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: 4 }}>.env.local</code> file:
              </p>

              <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '16px 20px', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--color-success)', marginBottom: 20, lineHeight: 2 }}>
                <div><span style={{ color: 'var(--text-muted)' }}># Email (Gmail App Password)</span></div>
                <div>GMAIL_USER=<span style={{ color: 'var(--color-warning)' }}>buildsight.ai@gmail.com</span></div>
                <div>GMAIL_APP_PASSWORD=<span style={{ color: 'var(--color-warning)' }}>xxxx-xxxx-xxxx-xxxx</span></div>
                <div>COMPANY_NAME=<span style={{ color: 'var(--color-warning)' }}>PARADIGM FRIENDS REALTORS LLP</span></div>
              </div>

              <details style={{ marginBottom: 20 }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  📖 How to create a Gmail App Password
                </summary>
                <ol style={{ marginTop: 12, paddingLeft: 20, fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
                  <li>Sign in to <strong>buildsight.ai@gmail.com</strong></li>
                  <li>Go to <strong>Google Account → Security → 2-Step Verification</strong> (enable it first)</li>
                  <li>At the bottom, click <strong>App passwords</strong></li>
                  <li>Select App: <em>Mail</em>, Device: <em>Other</em> → type "BuildSight Server"</li>
                  <li>Copy the 16-character password and paste it as <code>GMAIL_APP_PASSWORD</code></li>
                </ol>
              </details>

              <form onSubmit={handleTestEmail} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Send test email to</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="your@email.com"
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={emailStatus === 'loading'}>
                  {emailStatus === 'loading' ? '⏳ Sending…' : '📧 Send Test Email'}
                </button>
              </form>
              {emailMsg && (
                <div className={`alert ${emailStatus === 'success' ? 'alert-success' : 'alert-danger'} mt-4`} style={{ marginTop: 12 }}>
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
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
                Uses the <strong>official WhatsApp Business Cloud API</strong> by Meta — completely free to set up, 
                pay only per conversation beyond the free tier. No Gupshup or Wati needed.
              </p>

              <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '16px 20px', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--color-success)', marginBottom: 20, lineHeight: 2 }}>
                <div><span style={{ color: 'var(--text-muted)' }}># WhatsApp Business Cloud API (Meta)</span></div>
                <div>WHATSAPP_PHONE_NUMBER_ID=<span style={{ color: 'var(--color-warning)' }}>your_phone_number_id</span></div>
                <div>WHATSAPP_ACCESS_TOKEN=<span style={{ color: 'var(--color-warning)' }}>your_permanent_access_token</span></div>
              </div>

              <details style={{ marginBottom: 20 }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  📖 How to set up WhatsApp Cloud API (5 steps)
                </summary>
                <ol style={{ marginTop: 12, paddingLeft: 20, fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 2 }}>
                  <li>Go to <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>developers.facebook.com</a> → Create App → Business type</li>
                  <li>Add the <strong>WhatsApp</strong> product to your app</li>
                  <li>In <strong>WhatsApp → API Setup</strong>, copy the <em>Phone Number ID</em> → paste as <code>WHATSAPP_PHONE_NUMBER_ID</code></li>
                  <li>Go to <strong>Business Settings → System Users</strong> → Create a system user → Generate a permanent token with <em>whatsapp_business_messaging</em> permission → paste as <code>WHATSAPP_ACCESS_TOKEN</code></li>
                  <li>Add and verify your <strong>business phone number</strong> (the number buyers will receive messages from)</li>
                </ol>
              </details>

              {process.env.NEXT_PUBLIC_WHATSAPP_CONFIGURED !== 'true' && (
                <div className="alert" style={{ background: 'rgba(255,200,0,0.1)', border: '1px solid rgba(255,200,0,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: '0.875rem', color: 'var(--color-warning)' }}>
                  ⚡ <strong>Simulation Mode Active</strong> — Until credentials are set, messages are logged to the console but not actually sent. The Communications inbox will show status as <em>SIMULATED</em>.
                </div>
              )}

              <form onSubmit={handleTestWhatsApp} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Send test WhatsApp to (with country code)</label>
                  <input
                    type="tel"
                    className="form-input"
                    placeholder="919876543210"
                    value={testWaTo}
                    onChange={(e) => setTestWaTo(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={waStatus === 'loading'}>
                  {waStatus === 'loading' ? '⏳ Sending…' : '💬 Send Test WhatsApp'}
                </button>
              </form>
              {waMsg && (
                <div className={`alert ${waStatus === 'success' ? 'alert-success' : 'alert-danger'} mt-4`} style={{ marginTop: 12 }}>
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
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
                Additional environment variables to configure in <code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: 4 }}>.env.local</code>:
              </p>
              <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '16px 20px', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--color-success)', lineHeight: 2 }}>
                <div><span style={{ color: 'var(--text-muted)' }}># Application URL (used in document links sent via WhatsApp)</span></div>
                <div>APP_URL=<span style={{ color: 'var(--color-warning)' }}>https://your-production-domain.com</span></div>
                <div style={{ marginTop: 8 }}><span style={{ color: 'var(--text-muted)' }}># Interest & Tax defaults</span></div>
                <div>INTEREST_RATE_PA=<span style={{ color: 'var(--color-warning)' }}>12</span></div>
                <div>GST_RATE=<span style={{ color: 'var(--color-warning)' }}>5</span></div>
                <div>TDS_THRESHOLD=<span style={{ color: 'var(--color-warning)' }}>5000000</span></div>
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                <Link href="/communications" className="btn btn-secondary btn-sm">
                  💬 View Communications Inbox
                </Link>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
