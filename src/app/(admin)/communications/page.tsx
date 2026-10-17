'use client'

import { useState, useEffect, useCallback } from 'react'
import TopNav from '@/components/layout/TopNav'
import MessageDetailsModal from '@/components/comms/MessageDetailsModal'
import { Alert, Button, Card, EmptyRow, FilterChips, PageHeader, Pagination, StatCard, StatusBadge, Table, useToast } from '@/components/ui'
import { commStatusBadge } from '@/lib/status'
import { errorMessage, fetchJson } from '@/lib/client/api'
import { formatDateTime, formatNumber } from '@/lib/format'

const CHANNELS = [{ value: 'ALL', label: 'All' }, { value: 'EMAIL', label: '✉️ EMAIL' }, { value: 'WHATSAPP', label: '💬 WHATSAPP' }]
const STATUSES = ['ALL', 'PENDING', 'SENT', 'SIMULATED', 'DELIVERED', 'FAILED'].map((s) => ({ value: s, label: s === 'ALL' ? 'All' : s }))
const TYPES = ['ALL', 'DEMAND_LETTER', 'RECEIPT', 'MANUAL'].map((t) => ({ value: t, label: t === 'ALL' ? 'All' : t.replace(/_/g, ' ') }))
const CHANNEL_ICON: Record<string, string> = { EMAIL: '✉️', WHATSAPP: '💬' }

export default function CommunicationsPage() {
  const toast = useToast()
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [dispatching, setDispatching] = useState(false)
  const [selectedLog, setSelectedLog] = useState<any | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)

  // Filters
  const [channel, setChannel] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [type, setType] = useState('ALL')

  const [stats, setStats] = useState({ pending: 0, sent: 0, failed: 0, total: 0 })

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ channel, status, type, page: String(page) })
      const data = await fetchJson(`/api/communications/send?${params}`)
      setLogs(data.data)
      setTotal(data.total)
      setPages(data.pages)
      setLoadError('')
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [channel, status, type, page])

  const fetchStats = useCallback(async () => {
    try {
      const count = (qs: string) => fetchJson(`/api/communications/send${qs}`).then((r) => r.total ?? 0)
      const [pending, sent, failed, all] = await Promise.all([count('?status=PENDING'), count('?status=SENT'), count('?status=FAILED'), count('')])
      setStats({ pending, sent, failed, total: all })
    } catch { /* the list shows the error; the stat tiles just stay as they were */ }
  }, [])

  useEffect(() => { fetchLogs(); fetchStats() }, [fetchLogs, fetchStats])

  async function handleDispatch() {
    setDispatching(true)
    try {
      const data = await fetchJson('/api/communications/dispatch', { method: 'POST' })
      const s = data.summary
      toast.success(`Dispatch complete: ${s.sent} sent, ${s.simulated} simulated, ${s.failed} failed, ${s.skipped} skipped`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDispatching(false)
      fetchLogs()
      fetchStats()
    }
  }

  async function handleRetry(logId: string) {
    setRetrying(logId)
    try {
      await fetchJson(`/api/communications/${logId}/retry`, { method: 'POST' })
      toast.success('Message sent again')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setRetrying(null)
      fetchLogs()
      fetchStats()
    }
  }

  const successRate = stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0
  const rateAccent = successRate > 90 ? 'var(--color-success)' : successRate > 50 ? 'var(--color-warning)' : 'var(--color-danger)'
  const recipientOf = (log: any) => log.buyer ?? log.sale?.buyers?.[0]

  return (
    <>
      <TopNav title="Communications" subtitle="Global message dispatch — WhatsApp & Email" />
      <div className="admin-content">
        <PageHeader
          title="Communications"
          subtitle={`${formatNumber(total)} messages total`}
          actions={<Button variant="primary" loading={dispatching} onClick={handleDispatch}>{dispatching ? 'Dispatching…' : '🚀 Dispatch Pending'}</Button>}
        />

        {loadError && <Alert variant="danger" className="mb-4">{loadError}</Alert>}

        <div className="grid grid-4 gap-4 mb-6">
          <StatCard label="Total Messages" value={stats.total} />
          <StatCard label="Pending Dispatch" value={stats.pending} accent="var(--color-warning)" />
          <StatCard label="Successfully Sent" value={stats.sent} accent="var(--color-success)" />
          <StatCard label="Success Rate" value={`${successRate}%`} accent={rateAccent} />
        </div>

        <div className="flex gap-3 wrap mb-5">
          <FilterChips label="Channel" options={CHANNELS} value={channel} onChange={(v) => { setChannel(v); setPage(1) }} />
          <FilterChips label="Status" options={STATUSES} value={status} onChange={(v) => { setStatus(v); setPage(1) }} />
          <FilterChips label="Type" options={TYPES} value={type} onChange={(v) => { setType(v); setPage(1) }} />
        </div>

        <Card flush>
          <Table flush>
            <thead>
              <tr><th>Date</th><th>Channel</th><th>Type</th><th>Project / Unit</th><th>Buyer</th><th>Recipient</th><th>Status</th><th>Retries</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={9}>Loading…</EmptyRow>
              ) : logs.length === 0 ? (
                <EmptyRow colSpan={9}>No messages found</EmptyRow>
              ) : logs.map((log) => {
                const to = recipientOf(log)
                return (
                  <tr key={log.id} onClick={() => setSelectedLog(log)} className="cursor-pointer">
                    <td className="text-sm text-muted nowrap">{formatDateTime(log.createdAt)}</td>
                    <td><span className="badge badge-info">{CHANNEL_ICON[log.channel] ?? ''} {log.channel}</span></td>
                    <td className="text-sm">{log.type.replace(/_/g, ' ')}</td>
                    <td className="text-sm">
                      <div className="font-medium">{log.sale?.project?.name ?? '—'}</div>
                      <div className="text-muted">{log.sale?.unit?.unitNumber ?? ''}</div>
                    </td>
                    <td className="text-sm">{to?.fullName ?? '—'}</td>
                    <td className="text-sm text-muted">{(log.channel === 'EMAIL' ? to?.email : to?.whatsappNumber) ?? '—'}</td>
                    <td>
                      <StatusBadge kind="comm" status={log.status} />
                      {log.failureReason && <div className="text-danger text-2xs truncate mt-1" style={{ maxWidth: 160 }}>{log.failureReason}</div>}
                    </td>
                    <td className="text-center">{log.retryCount > 0 ? <span className="text-sm text-muted">{log.retryCount}×</span> : '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {log.status === 'FAILED' && <Button variant="ghost" size="sm" loading={retrying === log.id} onClick={() => handleRetry(log.id)}>🔄 Retry</Button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
          <Pagination page={page} pages={pages} onChange={setPage} />
        </Card>
      </div>

      {selectedLog && <MessageDetailsModal logs={[selectedLog]} retrying={retrying} onRetry={handleRetry} onClose={() => setSelectedLog(null)} />}
    </>
  )
}
