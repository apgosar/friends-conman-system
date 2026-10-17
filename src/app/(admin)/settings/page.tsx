'use client'

import { useState } from 'react'
import TopNav from '@/components/layout/TopNav'
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, PageHeader, TextField } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'

interface TestResult { ok: boolean; text: string }

/** One "send a test message" form: the channel only differs by endpoint, field label and the wording of the result. */
function useTestSend(endpoint: string, describe: (data: any) => string) {
  const [to, setTo] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setResult(null)
    try {
      const data = await fetchJson(endpoint, jsonRequest('POST', { to }))
      setResult({ ok: true, text: describe(data) })
    } catch (err) {
      setResult({ ok: false, text: errorMessage(err) })
    } finally {
      setSending(false)
    }
  }
  return { to, setTo, sending, result, submit }
}

export default function SettingsPage() {
  const email = useTestSend('/api/settings/test-email', (d) => `Email sent. Message ID: ${d.messageId}`)
  const whatsapp = useTestSend('/api/settings/test-whatsapp', (d) =>
    d.status === 'simulated' ? `Simulated, because WhatsApp credentials are not configured. Message ID: ${d.messageId}` : `WhatsApp message sent. Message ID: ${d.messageId}`)

  return (
    <>
      <TopNav title="Settings" subtitle="Integration configuration and testing" />
      <div className="admin-content">
        <PageHeader title="Settings" subtitle="Configure and test communication integrations" />

        <div className="grid gap-6 max-w-xl">
          <Card>
            <CardHeader title="✉️ Email Integration (Gmail SMTP)" actions={<Badge variant={process.env.NEXT_PUBLIC_EMAIL_CONFIGURED === 'true' ? 'success' : 'muted'}>Configured via .env.local</Badge>} />
            <p className="text-secondary mb-5">
              Emails are sent via Gmail SMTP using a Google App Password. Set the following in your <code className="inline-code">.env.local</code> file:
            </p>
            <div data-scroll className="config-sample mb-5">
              <div><span className="text-muted"># Email (Gmail App Password)</span></div>
              <div>GMAIL_USER=<span className="text-warning">neevcms@gmail.com</span></div>
              <div>GMAIL_APP_PASSWORD=<span className="text-warning">xxxx-xxxx-xxxx-xxxx</span></div>
              <div>COMPANY_NAME=<span className="text-warning">Your Company Name</span></div>
            </div>

            <details className="mb-5">
              <summary className="cursor-pointer text-base text-secondary font-medium">📖 How to create a Gmail App Password</summary>
              <ol className="steps-list">
                <li>Sign in to <strong>neevcms@gmail.com</strong></li>
                <li>Go to <strong>Google Account → Security → 2-Step Verification</strong> (enable it first)</li>
                <li>At the bottom, click <strong>App passwords</strong></li>
                <li>Select App: <em>Mail</em>, Device: <em>Other</em> → type &quot;Neev CMS Server&quot;</li>
                <li>Copy the 16-character password and paste it as <code>GMAIL_APP_PASSWORD</code></li>
              </ol>
            </details>

            <form onSubmit={email.submit} className="flex gap-3 items-end wrap">
              <TextField wrapperClassName="flex-1" label="Send test email to" type="email" placeholder="your@email.com" value={email.to} onChange={(e) => email.setTo(e.target.value)} required />
              <Button type="submit" variant="primary" loading={email.sending}>📧 Send Test Email</Button>
            </form>
            {email.result && <Alert variant={email.result.ok ? 'success' : 'danger'} className="mt-4">{email.result.text}</Alert>}
          </Card>

          <Card>
            <CardHeader title="💬 WhatsApp Integration (Meta Cloud API)" actions={<Badge>Direct — no third party needed</Badge>} />
            <p className="text-secondary mb-5">
              Uses the <strong>official WhatsApp Business Cloud API</strong> by Meta. It is free to set up and you pay only per conversation beyond the free tier. No Gupshup or Wati needed.
            </p>
            <div data-scroll className="config-sample mb-5">
              <div><span className="text-muted"># WhatsApp Business Cloud API (Meta)</span></div>
              <div>WHATSAPP_PHONE_NUMBER_ID=<span className="text-warning">your_phone_number_id</span></div>
              <div>WHATSAPP_ACCESS_TOKEN=<span className="text-warning">your_permanent_access_token</span></div>
            </div>

            <details className="mb-5">
              <summary className="cursor-pointer text-base text-secondary font-medium">📖 How to set up WhatsApp Cloud API (5 steps)</summary>
              <ol className="steps-list">
                <li>Go to <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-brand">developers.facebook.com</a> → Create App → Business type</li>
                <li>Add the <strong>WhatsApp</strong> product to your app</li>
                <li>In <strong>WhatsApp → API Setup</strong>, copy the <em>Phone Number ID</em> → paste as <code>WHATSAPP_PHONE_NUMBER_ID</code></li>
                <li>Go to <strong>Business Settings → System Users</strong> → Create a system user → Generate a permanent token with <em>whatsapp_business_messaging</em> permission → paste as <code>WHATSAPP_ACCESS_TOKEN</code></li>
                <li>Add and verify your <strong>business phone number</strong> (the number buyers will receive messages from)</li>
              </ol>
            </details>

            <form onSubmit={whatsapp.submit} className="flex gap-3 items-end wrap">
              <TextField wrapperClassName="flex-1" label="Send test WhatsApp to (with country code)" type="tel" inputMode="tel" placeholder="919876543210" value={whatsapp.to} onChange={(e) => whatsapp.setTo(e.target.value)} required />
              <Button type="submit" variant="primary" loading={whatsapp.sending}>💬 Send Test WhatsApp</Button>
            </form>
            {whatsapp.result && <Alert variant={whatsapp.result.ok ? 'success' : 'danger'} className="mt-4">{whatsapp.result.text}</Alert>}
          </Card>

          <Card>
            <CardHeader title="⚙️ App Configuration" />
            <p className="text-secondary mb-4">Additional environment variables to configure in <code className="inline-code">.env.local</code>:</p>
            <div data-scroll className="config-sample">
              <div><span className="text-muted"># Application URL (used in document links sent via WhatsApp)</span></div>
              <div>APP_URL=<span className="text-warning">https://your-production-domain.com</span></div>
              <div className="mt-2"><span className="text-muted"># Interest & Tax defaults</span></div>
              <div>INTEREST_RATE_PA=<span className="text-warning">12</span></div>
              <div>GST_RATE=<span className="text-warning">5</span></div>
              <div>TDS_THRESHOLD=<span className="text-warning">5000000</span></div>
            </div>
            <div className="mt-4">
              <ButtonLink href="/communications" size="sm">💬 View Communications Inbox</ButtonLink>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
