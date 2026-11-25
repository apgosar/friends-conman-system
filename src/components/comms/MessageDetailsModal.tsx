'use client'

import { useEffect, useRef, useState } from 'react'
import { Alert, Badge, Button, Modal, StatusBadge } from '@/components/ui'
import { getAttachments, pdfViewUrl, stripAttachmentBlock } from '@/lib/comms-content'
import { formatDateTime } from '@/lib/format'
import { fetchJson } from '@/lib/client/api'

const CHANNEL_ICON: Record<string, string> = { EMAIL: '✉️', WHATSAPP: '💬' }
const fmt = (d: unknown) => (d ? formatDateTime(d as string) : '—')
const humanize = (s: string) => s.replace(/_/g, ' ')

/**
 * One message as people want to read it: who got it, how each channel went, the text and its attachments.
 * `logs` is one row per channel of the same message (the sale page groups them); the global list passes a single row.
 */
const POLL_MS = 3000
const POLL_FOR_MS = 10 * 60 * 1000
// Still on its way: waiting or sending, or a WhatsApp message that is not yet read (Gupshup reports delivered and read later)
type Live = { id: string; status: string; sentAt: string | null; deliveredAt: string | null; readAt: string | null; failureReason: string | null; retryCount: number; providerMessageId: string | null }
const inFlight = (l: { status: string; channel: string }) => ['QUEUED', 'PENDING', 'SENDING'].includes(l.status) || (l.channel === 'WHATSAPP' && ['SENT', 'DELIVERED'].includes(l.status))

export default function MessageDetailsModal({ logs: given, onClose, onRetry, retrying, onChanged }: { logs: any[]; onClose: () => void; onRetry?: (id: string) => void; retrying?: string | null; onChanged?: () => void }) {
  // The rows were read when the page loaded; while a message is still on its way the window asks for its state again
  const [fresh, setFresh] = useState<Record<string, Live>>({})
  const changed = useRef(false)
  const logs = given.map((l) => ({ ...l, ...fresh[l.id] }))
  const watching = logs.some(inFlight)
  const ids = given.map((l) => l.id).join(',')

  useEffect(() => {
    if (!watching) return
    const until = Date.now() + POLL_FOR_MS
    const timer = setInterval(async () => {
      if (document.hidden) return
      if (Date.now() > until) return clearInterval(timer)
      try {
        const res = await fetchJson(`/api/communications/status?ids=${ids}`)
        const next: Record<string, any> = {}
        for (const r of res.data ?? []) next[r.id] = r
        changed.current = true
        setFresh((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
      } catch { /* the next tick tries again */ }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [watching, ids])

  const close = () => { if (changed.current) onChanged?.(); onClose() }
  const first = logs[0]
  const buyer = first.buyer ?? first.sale?.buyers?.[0]
  const body = stripAttachmentBlock(first.messageContent ?? '').split('MILESTONE:')[0].trim()
  const attachments = getAttachments(first)
  const failed = logs.filter((l) => l.status === 'FAILED')

  return (
    <Modal
      title="Message Details"
      subtitle={`${logs.map((l) => l.channel).join(' + ')} · ${fmt(first.createdAt)}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          {onRetry && failed.map((l) => (
            <Button key={l.id} variant="primary" loading={retrying === l.id} onClick={() => { onRetry(l.id); close() }}>Retry {logs.length > 1 ? l.channel : 'this message'}</Button>
          ))}
          <Button onClick={close}>Close</Button>
        </>
      }
    >
      <div className="row mb-4">
        <Badge variant="info">{humanize(first.type)}</Badge>
        {first.retryCount > 0 && <Badge variant="warning">{first.retryCount} retries</Badge>}
      </div>

      {buyer && (
        <div className="card-flat mb-4 text-base">
          <strong>{buyer.fullName}</strong>
          {buyer.email && <span className="ml-3 text-muted">✉️ {buyer.email}</span>}
          {buyer.whatsappNumber && <span className="ml-3 text-muted">💬 {buyer.whatsappNumber}</span>}
        </div>
      )}

      <div className="grid gap-3 mb-4 grid-auto">
        {logs.map((l) => (
          <div key={l.id} className="card-flat text-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold">{CHANNEL_ICON[l.channel] ?? ''} {l.channel}</span>
              <StatusBadge kind="comm" status={l.status} />
            </div>
            <div className="stack-sm text-secondary">
              <div>Sent: {fmt(l.sentAt)}</div>
              {l.deliveredAt && <div>Delivered: {fmt(l.deliveredAt)}</div>}
              {l.readAt && <div>Read: {fmt(l.readAt)}</div>}
              {l.retryCount > 0 && <div>Retries: {l.retryCount}</div>}
              {l.providerMessageId && <div className="break-words">Provider ID: <code>{l.providerMessageId}</code></div>}
            </div>
            {l.failureReason && <Alert variant="danger" className="mt-3"><strong>Failure:</strong> {l.failureReason}</Alert>}
          </div>
        ))}
      </div>

      <div className="card-flat">
        <div className="section-label mb-2">Message Content</div>
        <div className="text-base" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{body || 'No content'}</div>

        {attachments.length > 0 && (
          <div className="mt-5 pt-4 border-top">
            <div className="section-label mb-3">Attachments</div>
            <div className="row">
              {attachments.map((a, i) => (
                <a key={i} href={pdfViewUrl(a.path)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">📄 {a.label}</a>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
