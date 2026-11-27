'use client'

import { BookOpen, Inbox, Mail, MessageCircle, Settings } from 'lucide-react'
import { useState } from 'react'
import TopNav from '@/components/layout/TopNav'
import ServerUpdateCard from '@/components/settings/ServerUpdateCard'
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, PhoneField, TextField } from '@/components/ui'
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
      <TopNav title="Settings" subtitle="Configure and test communication integrations" />
      <div className="admin-content">
        <div className="grid gap-6 max-w-xl">
          <ServerUpdateCard />

          <Card>
            <CardHeader title={<><Mail /> Email Integration (Gmail SMTP)</>} actions={<Badge variant={process.env.NEXT_PUBLIC_EMAIL_CONFIGURED === 'true' ? 'success' : 'muted'}>Configured via .env.local</Badge>} />
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
              <summary className="cursor-pointer text-base text-secondary font-medium"><BookOpen /> How to create a Gmail App Password</summary>
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
              <Button type="submit" variant="primary" loading={email.sending}><Mail /> Send Test Email</Button>
            </form>
            {email.result && <Alert variant={email.result.ok ? 'success' : 'danger'} className="mt-4">{email.result.text}</Alert>}
          </Card>

          <Card>
            <CardHeader title={<><MessageCircle /> WhatsApp Integration (Gupshup)</>} actions={<Badge>Approved templates</Badge>} />
            <p className="text-secondary mb-5">
              Messages are sent through <strong>Gupshup</strong> as approved WhatsApp templates. Each template is sent by its template ID from the Gupshup console.
            </p>
            <div data-scroll className="config-sample mb-5">
              <div><span className="text-muted"># WhatsApp through Gupshup</span></div>
              <div>GUPSHUP_API_KEY=<span className="text-warning">your_api_key</span></div>
              <div>GUPSHUP_SOURCE=<span className="text-warning">919876543210</span></div>
              <div>GUPSHUP_APP_NAME=<span className="text-warning">your_app_name</span></div>
              <div>GUPSHUP_TEMPLATE_DEMANDS_AND_RECEIPTS=<span className="text-warning">template_id</span></div>
              <div>GUPSHUP_TEMPLATE_QUOTATION=<span className="text-warning">template_id</span></div>
            </div>

            <details className="mb-5">
              <summary className="cursor-pointer text-base text-secondary font-medium"><BookOpen /> Where to find these in Gupshup</summary>
              <ol className="steps-list">
                <li>In the Gupshup console, copy the account <strong>API key</strong> → <code>GUPSHUP_API_KEY</code></li>
                <li>Your registered <strong>business number</strong> (country code, digits only) → <code>GUPSHUP_SOURCE</code></li>
                <li>The <strong>app name</strong> of that number → <code>GUPSHUP_APP_NAME</code></li>
                <li>Under <strong>Templates</strong>, copy the <strong>template ID</strong> of <em>demands_and_receipts_v2</em> and of <em>quotation_share</em> into the two template variables</li>
              </ol>
            </details>

            <form onSubmit={whatsapp.submit} className="flex gap-3 items-end wrap">
              <PhoneField wrapperClassName="flex-1" label="Send test WhatsApp to" value={whatsapp.to} onValueChange={whatsapp.setTo} required />
              <Button type="submit" variant="primary" loading={whatsapp.sending}><MessageCircle /> Send Test WhatsApp</Button>
            </form>
            {whatsapp.result && <Alert variant={whatsapp.result.ok ? 'success' : 'danger'} className="mt-4">{whatsapp.result.text}</Alert>}
          </Card>

          <Card>
            <CardHeader title={<><Settings /> App Configuration</>} />
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
              <ButtonLink href="/communications" size="sm"><Inbox /> View Communications Inbox</ButtonLink>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
