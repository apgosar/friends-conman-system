'use client'

import { useState } from 'react'
import { EmptyState, Table } from '@/components/ui'
import { commStatusBadge, commStatusLabel } from '@/lib/status'
import { formatDateTime } from '@/lib/format'
import { stripAttachmentBlock } from '@/lib/comms-content'
import MessageDetailsModal from '@/components/comms/MessageDetailsModal'
const GROUP_WINDOW_MS = 60_000
const CHANNEL_ORDER = ['EMAIL', 'WHATSAPP']

type LogGroup = { key: string; createdAt: any; type: string; saleId: string; messageContent: string | null; logs: any[] }

// The same message goes out as one log row per channel. Merge those rows into one entry.
function groupLogs(logs: any[]): LogGroup[] {
  const groups: LogGroup[] = []
  for (const log of logs) {
    const t = new Date(log.createdAt).getTime()
    const g = groups.find(
      (x) =>
        x.type === log.type &&
        x.messageContent === log.messageContent &&
        x.logs[0].buyerId === log.buyerId &&
        !x.logs.some((l) => l.channel === log.channel) &&
        Math.abs(new Date(x.createdAt).getTime() - t) <= GROUP_WINDOW_MS,
    )
    if (g) g.logs.push(log)
    else groups.push({ key: log.id, createdAt: log.createdAt, type: log.type, saleId: log.saleId, messageContent: log.messageContent, logs: [log] })
  }
  groups.forEach((g) => g.logs.sort((a, b) => CHANNEL_ORDER.indexOf(a.channel) - CHANNEL_ORDER.indexOf(b.channel)))
  return groups
}

export default function CommunicationLogTable({ logs }: { logs: any[] }) {
  const [selected, setSelected] = useState<LogGroup | null>(null)
  const groups = groupLogs(logs ?? [])

  if (!logs || logs.length === 0) return <EmptyState>No communications logged yet.</EmptyState>

  return (
    <>
      <Table flush>
        <thead>
          <tr><th>Date</th><th>Channel</th><th>Type</th><th>Milestone</th><th>Content Snippet</th></tr>
        </thead>
        <tbody>
          {groups.map((log) => {
            const demandMatch = log.messageContent?.match(/The milestone '(.*?)' is now complete/)
            const paymentMatch = log.messageContent?.match(/Payment for '(.*?)' is now due/)
            const receiptMatch = log.messageContent?.match(/MILESTONE:\s*(.*?)(?:\n|$)/)
            const milestoneName = demandMatch ? demandMatch[1] : (paymentMatch ? paymentMatch[1] : (receiptMatch ? receiptMatch[1] : '—'))
            const snippet = log.messageContent ? stripAttachmentBlock(log.messageContent).split('MILESTONE:')[0].trim().substring(0, 50) + '...' : '—'
            return (
              <tr key={log.key} onClick={() => setSelected(log)} className="cursor-pointer">
                <td>{log.createdAt ? formatDateTime(log.createdAt) : '—'}</td>
                <td>
                  <div className="flex gap-2">
                    {log.logs.map((l: any) => <span key={l.id} className={`badge ${commStatusBadge(l.status)}`} title={commStatusLabel(l.status)}>{l.channel}</span>)}
                  </div>
                </td>
                <td>{log.type.replace(/_/g, ' ')}</td>
                <td>{milestoneName}</td>
                <td className="text-muted truncate" style={{ maxWidth: 300 }}>{snippet}</td>
              </tr>
            )
          })}
        </tbody>
      </Table>

      {selected && <MessageDetailsModal logs={selected.logs} onClose={() => setSelected(null)} />}
    </>
  )
}
