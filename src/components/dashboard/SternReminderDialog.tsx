'use client'

import { formatPhone } from '@/lib/phone'
import { Alert, Button, Modal } from '@/components/ui'
import type { EscalationRow } from '@/lib/escalations'
import type { SternReminderPreview } from '@/lib/stern-reminder-types'

/** The confirmation for a stern reminder: who gets it and what they will read. */
export default function SternReminderDialog({ row, preview, sending, onSend, onClose }: {
  row: EscalationRow; preview: SternReminderPreview; sending: boolean; onSend: () => void; onClose: () => void
}) {
  const [first] = preview.messages
  return (
    <Modal
      title="Send stern reminder"
      subtitle={`${row.projectName} — ${row.unitNumber}`}
      size="lg"
      onClose={onClose}
      dismissible={!sending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button variant="danger" onClick={onSend} loading={sending}>Send reminder</Button>
        </>
      }
    >
      <div className="flex dir-col gap-4">
        <div>
          <div className="font-semibold mb-2">Sent to</div>
          {preview.messages.map((m, i) => (
            <div key={i} className="text-sm text-secondary">
              {m.buyerName}: {[m.email && `email ${m.email}`, m.whatsappNumber && `WhatsApp ${formatPhone(m.whatsappNumber)}`].filter(Boolean).join(', ')}
            </div>
          ))}
        </div>

        <div>
          <div className="font-semibold mb-2">Email</div>
          <div className="text-sm text-muted mb-2">Subject: {preview.subject}</div>
          <div className="message-preview">{first.text}</div>
          {preview.messages.length > 1 && <div className="text-sm text-muted mt-2">Each buyer’s message starts with their own name</div>}
        </div>

        <div>
          <div className="font-semibold mb-2">WhatsApp</div>
          <div className="text-sm text-secondary mb-2">
            Sent with your approved stern reminder template, filled with these details
          </div>
          {preview.whatsapp.values.map((v) => (
            <div key={v.label} className="text-sm"><span className="text-muted">{v.label}:</span> {v.value}</div>
          ))}
        </div>

        <div className="text-sm">
          <span className="text-muted">Attached:</span>{' '}
          <a href={preview.attachment.url} target="_blank" rel="noreferrer">{preview.attachment.label}</a>
        </div>

        <Alert variant="warning" noScroll>A message that has been sent cannot be taken back</Alert>
      </div>
    </Modal>
  )
}
