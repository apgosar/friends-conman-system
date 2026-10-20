'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Modal, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'

/**
 * Super-admin only: set the order of a project's milestones by hand. The order normally follows the payment plans; once it is
 * set here it stays as set (plan changes add new milestones at the end) until "Use the automatic order" is chosen.
 */
export default function ReorderMilestones({ projectId, milestones, manual }: {
  projectId: string
  milestones: { id: string; name: string }[]
  /** The order was already set by hand. */
  manual: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState(milestones)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const move = (from: number, to: number) => setList((prev) => {
    if (to < 0 || to >= prev.length) return prev
    const next = [...prev]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  })

  const changed = list.some((m, i) => m.id !== milestones[i]?.id)

  const send = async (body: { ids: string[] } | { automatic: true }, message: string) => {
    setSaving(true)
    setError('')
    try {
      await fetchJson(`/api/projects/${projectId}/milestones/order`, jsonRequest('PUT', body))
      toast.success(message)
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button onClick={() => { setList(milestones); setError(''); setOpen(true) }}>Reorder</Button>
      {open && (
        <Modal
          title="Reorder milestones"
          subtitle={manual ? 'Set by hand' : 'Following the payment plans'}
          dismissible={!saving}
          onClose={() => setOpen(false)}
          footer={
            <>
              {manual && <Button variant="ghost" onClick={() => send({ automatic: true }, 'Milestones follow the payment plans again')} disabled={saving}>Use the automatic order</Button>}
              <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
              <Button variant="primary" loading={saving} disabled={!changed} onClick={() => send({ ids: list.map((m) => m.id) }, 'Milestone order saved')}>Save order</Button>
            </>
          }
        >
          {error && <Alert variant="danger" className="mb-3">{error}</Alert>}
          <p className="text-sm text-muted mb-3">Move a milestone up or down. After you save, changing a payment plan no longer re-sorts the list; new milestones go to the end.</p>
          <ol className="flex dir-col gap-2 m-0 p-0 list-none">
            {list.map((m, i) => (
              <li key={m.id} className="flex items-center gap-2">
                <span className="text-muted font-semibold col-xs">{i + 1}</span>
                <span className="flex-1">{m.name}</span>
                <Button variant="ghost" size="sm" icon aria-label={`Move ${m.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</Button>
                <Button variant="ghost" size="sm" icon aria-label={`Move ${m.name} down`} disabled={i === list.length - 1} onClick={() => move(i, i + 1)}>↓</Button>
              </li>
            ))}
          </ol>
        </Modal>
      )}
    </>
  )
}
