'use client'

import { useState, useEffect, useCallback } from 'react'
import TopNav from '@/components/layout/TopNav'
import { Alert, Badge, Card, EmptyRow, FilterChips, Modal, PageHeader, Pagination, Table, Td } from '@/components/ui'
import { errorMessage, fetchJson } from '@/lib/client/api'
import { formatDateTime, formatNumber } from '@/lib/format'

const option = (v: string) => ({ value: v, label: v === 'ALL' ? 'All' : v.replace(/_/g, ' ') })
const ENTITY_TYPES = ['ALL', 'sale', 'payment', 'unit', 'project', 'buyer', 'communication_log'].map(option)
const ACTIONS = ['ALL', 'created', 'updated', 'deleted', 'sent', 'verified'].map(option)

const ACTION_VARIANT = { created: 'success', updated: 'warning', deleted: 'danger', sent: 'info', verified: 'primary' } as const
const actionVariant = (a: string) => ACTION_VARIANT[a as keyof typeof ACTION_VARIANT] ?? 'muted'

const hasValues = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && Object.keys(v).length > 0

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [entityType, setEntityType] = useState('ALL')
  const [action, setAction] = useState('ALL')
  const [selectedLog, setSelectedLog] = useState<any | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ entityType, action, page: String(page) })
      const data = await fetchJson(`/api/audit?${params}`)
      setLogs(data.data)
      setTotal(data.total)
      setPages(data.pages)
      setLoadError('')
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [entityType, action, page])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  return (
    <>
      <TopNav title="System Audit Logs" subtitle="Track user activity and system events" />
      <div className="admin-content">
        <PageHeader title="Audit Logs" subtitle={`${formatNumber(total)} total events recorded`} />

        {loadError && <Alert variant="danger" className="mb-4">{loadError}</Alert>}

        <div className="flex gap-3 wrap mb-5">
          <FilterChips label="Entity" options={ENTITY_TYPES} value={entityType} onChange={(v) => { setEntityType(v); setPage(1) }} />
          <FilterChips label="Action" options={ACTIONS} value={action} onChange={(v) => { setAction(v); setPage(1) }} />
        </div>

        <Card flush>
          <Table flush stack>
            <thead>
              <tr><th>Timestamp</th><th>User</th><th>Action</th><th>Entity Type</th><th>Entity ID</th><th>Project</th><th>IP Address</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={7}>Loading…</EmptyRow>
              ) : logs.length === 0 ? (
                <EmptyRow colSpan={7}>No logs found</EmptyRow>
              ) : logs.map((log) => (
                <tr key={log.id} onClick={() => setSelectedLog(log)} className="row-link">
                  <Td label="Time" className="text-sm text-muted nowrap">{formatDateTime(log.createdAt)}</Td>
                  <Td label="User" className="text-sm font-medium">{log.user?.name ?? 'System'}</Td>
                  <Td label="Action"><Badge variant={actionVariant(log.action)}>{log.action}</Badge></Td>
                  <Td label="Entity" className="text-sm uppercase">{log.entityType}</Td>
                  <Td label="Entity ID" className="text-sm text-muted mono">{log.entityId.slice(-8)}</Td>
                  <Td label="Project" className="text-sm">{log.project?.name ?? '—'}</Td>
                  <Td label="IP" className="text-sm text-muted">{log.ipAddress ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pages={pages} onChange={setPage} />
        </Card>
      </div>

      {selectedLog && (
        <Modal
          title="Audit log details"
          subtitle={`${formatDateTime(selectedLog.createdAt)} by ${selectedLog.user?.name ?? 'System'}`}
          size="lg"
          onClose={() => setSelectedLog(null)}
        >
          <div className="flex gap-2 mb-5 wrap">
            <Badge variant={actionVariant(selectedLog.action)}>{selectedLog.action}</Badge>
            <Badge variant="info">{selectedLog.entityType.toUpperCase()}</Badge>
            <Badge className="mono">ID: {selectedLog.entityId}</Badge>
          </div>

          {hasValues(selectedLog.oldValues) && (
            <div className="mb-5">
              <div className="label-caps text-danger mb-2">Old values</div>
              <pre className="code-block code-block-old">{JSON.stringify(selectedLog.oldValues, null, 2)}</pre>
            </div>
          )}
          {hasValues(selectedLog.newValues) && (
            <div>
              <div className="label-caps text-success mb-2">New values</div>
              <pre className="code-block code-block-new">{JSON.stringify(selectedLog.newValues, null, 2)}</pre>
            </div>
          )}
          {!hasValues(selectedLog.oldValues) && !hasValues(selectedLog.newValues) && (
            <div className="empty-state">No data was recorded for this event.</div>
          )}
        </Modal>
      )}
    </>
  )
}
