'use client'

import { Send } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/format'
import { Badge, Button, ButtonLink, Card, CardHeader, Table, Td, useToast } from '@/components/ui'
import SternReminderDialog from './SternReminderDialog'
import type { SternReminderPreview } from '@/lib/stern-reminder-types'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import type { EscalationRow } from '@/lib/escalations'

export default function EscalationAlerts({ escalations }: { escalations: EscalationRow[] }) {
  const toast = useToast()
  const router = useRouter()
  const [opening, setOpening] = useState<string | null>(null)
  const [review, setReview] = useState<{ row: EscalationRow; preview: SternReminderPreview } | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<Set<string>>(new Set())

  /** The message is fetched and shown first; nothing is sent until it is confirmed there */
  async function openPreview(row: EscalationRow) {
    setOpening(row.id)
    try {
      const { data } = await fetchJson<{ data: SternReminderPreview }>(`/api/escalations/preview?scheduleId=${row.id}`)
      setReview({ row, preview: data })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setOpening(null)
    }
  }

  async function sendSternReminder(row: EscalationRow) {
    setSending(true)
    try {
      await fetchJson('/api/escalations/approve', jsonRequest('POST', { scheduleId: row.id }))
      setDone((prev) => new Set(prev).add(row.id))
      setReview(null)
      toast.success('Stern reminder is being sent. Check the communication log for its status')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err)) // the row stays, so nobody thinks it went out
    } finally {
      setSending(false)
    }
  }

  const visible = escalations.filter((e) => !done.has(e.id))
  if (visible.length === 0) return null

  return (
    <Card className="card-danger-soft">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="status-dot status-dot-red status-dot-pulse" />
            <span className="text-danger">Management Action Required</span>
            <Badge variant="danger">{visible.length}</Badge>
          </span>
        }
      />
      <Table stack>
        <thead>
          <tr><th>Unit and buyer</th><th>Payment</th><th className="text-right">Outstanding</th><th></th></tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.id}>
              <Td label="Unit">
                <div>
                  <Link href={`/sales/${row.saleId}`} className="font-semibold">{row.projectName} — {row.unitNumber}</Link>
                  <div className="text-sm text-muted">{row.buyerName}</div>
                </div>
              </Td>
              <Td label="Payment">
                <div>
                  <div>{row.description}</div>
                  <div className="text-sm text-muted">Due {row.dueDate ? formatDate(row.dueDate) : '—'}</div>
                </div>
              </Td>
              <Td label="Outstanding" className="text-right">
                <div>
                  <div className="text-danger font-semibold nowrap">{formatCurrency(row.outstanding)}</div>
                  <div className="text-sm text-muted nowrap">{row.daysOverdue} days overdue</div>
                </div>
              </Td>
              <Td label="" className="text-right">
                {row.commsEnabled ? (
                  <Button variant="danger" size="sm" loading={opening === row.id} onClick={() => openPreview(row)} id={`approve-escalation-${row.id}`}>
                    <Send /> Send Stern Reminder
                  </Button>
                ) : (
                  <>
                    <Badge variant="muted">Communication off</Badge>
                    <ButtonLink href={`/sales/${row.saleId}`} variant="ghost" size="sm">Open sale</ButtonLink>
                  </>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {visible.some((row) => !row.commsEnabled) && <p className="text-sm text-muted mt-3 mb-0">Where communication is off, turn it on from the sale page to send a reminder</p>}
      {review && <SternReminderDialog row={review.row} preview={review.preview} sending={sending} onSend={() => sendSternReminder(review.row)} onClose={() => setReview(null)} />}
    </Card>
  )
}
