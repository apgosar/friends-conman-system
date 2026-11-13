'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, AmountInWords, Button, CheckboxField, Input, Modal, StatusBadge, Table, Td, TextField, TextareaField, useConfirm, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { amountInWords, formatCurrency } from '@/lib/format'
import { plural } from '@/lib/errors'
import type { CorrectionProposal } from '@/lib/sales/correct-agreement-value'

const num = (v: string) => (v.trim() === '' ? NaN : Number(v))
const paise = (n: number) => Math.round(n * 100)

/** Super Admin: correct a sale's agreement value entered by mistake, and revise its demands to match. */
export default function CorrectAgreementValue({ saleId, agreementValue }: { saleId: string; agreementValue: number }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} title="Super Admin: fix an agreement value entered by mistake">Correct agreement value</Button>
      {open && <CorrectionModal saleId={saleId} current={agreementValue} onClose={() => setOpen(false)} />}
    </>
  )
}

function CorrectionModal({ saleId, current, onClose }: { saleId: string; current: number; onClose: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [value, setValue] = useState('')
  const [proposal, setProposal] = useState<CorrectionProposal | null>(null)
  const [rows, setRows] = useState<Record<string, { principal: string; gst: string }>>({})
  const [stampDuty, setStampDuty] = useState('')
  const [registration, setRegistration] = useState('')
  const [reason, setReason] = useState('')
  const [sendLetters, setSendLetters] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const workOut = async () => {
    setError('')
    const v = num(value)
    if (!(v > 0)) { setError('Enter the correct agreement value'); return }
    setBusy(true)
    try {
      const res = await fetchJson(`/api/sales/${saleId}/agreement-value?value=${encodeURIComponent(String(v))}`)
      const p = res.data as CorrectionProposal
      setProposal(p)
      setRows(Object.fromEntries(p.rows.map((r) => [r.scheduleId, { principal: String(r.newPrincipal), gst: String(r.newGst) }])))
      setStampDuty(String(p.stampDuty))
      setRegistration(String(p.registration))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const newValue = proposal?.newAgreementValue ?? 0
  const total = proposal ? proposal.rows.reduce((t, r) => t + paise(num(rows[r.scheduleId]?.principal ?? '') || 0), 0) / 100 : 0
  const totalOff = proposal ? (proposal.instalmentsMatchValue ? Math.abs(paise(total) - paise(newValue)) > 100 : paise(total) > paise(newValue) + 100) : false
  const belowPaid = proposal?.rows.find((r) => (num(rows[r.scheduleId]?.principal ?? '') || 0) < r.principalPaid || (num(rows[r.scheduleId]?.gst ?? '') || 0) < r.gstPaid)
  const letters = proposal ? proposal.rows.filter((r) => {
    const p = num(rows[r.scheduleId]?.principal ?? '') || 0, g = num(rows[r.scheduleId]?.gst ?? '') || 0
    return r.raised && (paise(p) !== paise(r.oldPrincipal) || paise(g) !== paise(r.oldGst)) && paise(p + g) > paise(r.principalPaid + r.gstPaid)
  }).length : 0
  const setRow = (id: string, k: 'principal' | 'gst', v: string) => setRows((x) => ({ ...x, [id]: { ...x[id], [k]: v } }))

  const save = async () => {
    if (!proposal) return
    setError('')
    if (reason.trim().length < 3) { setError('Say why the agreement value is being corrected'); return }
    const ok = await confirm({
      title: 'Correct the agreement value?',
      message: `The agreement value goes from ${formatCurrency(current)} to ${formatCurrency(newValue)} and the demands change as shown.${sendLetters && letters > 0 ? ` A revised demand letter goes to the buyers for ${plural(letters, 'demand')}.` : ''} This is recorded in the audit log.`,
      confirmLabel: 'Save correction',
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetchJson(`/api/sales/${saleId}/agreement-value`, jsonRequest('POST', {
        agreementValue: newValue,
        stampDuty: num(stampDuty) || 0,
        registration: num(registration) || 0,
        rows: proposal.rows.map((r) => ({ scheduleId: r.scheduleId, principalAmount: num(rows[r.scheduleId].principal) || 0, gstAmount: num(rows[r.scheduleId].gst) || 0 })),
        reason,
        sendRevisedLetters: sendLetters,
      }))
      toast.success(`Agreement value corrected. ${plural(res.data.demandsChanged, 'demand')} revised${res.data.letters > 0 ? `, ${plural(res.data.letters, 'message')} queued` : ''}`)
      router.refresh()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Correct agreement value"
      subtitle={`Now ${formatCurrency(current)}`}
      size="xl"
      dismissible={!busy}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          {proposal
            ? <Button variant="primary" loading={busy} disabled={totalOff || !!belowPaid} onClick={save}>Save correction</Button>
            : <Button variant="primary" loading={busy} onClick={workOut}>Work out the new amounts</Button>}
        </>
      }
    >
      <div className="flex dir-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <div className="flex gap-3 items-end wrap">
          <TextField
            label="Correct agreement value (₹)"
            type="number"
            min={1}
            wrapperClassName="max-w-sm w-full"
            value={value}
            hint={amountInWords(value) || 'The amount the agreement value should have been'}
            onChange={(e) => { setValue(e.target.value); setProposal(null) }}
          />
          {proposal && <Button variant="ghost" onClick={workOut} disabled={busy}>Work out again</Button>}
        </div>

        {proposal && (
          <>
            <p className="m-0 text-sm text-muted">
              Each instalment is scaled to the new value, with its GST at the same rate. Change any amount if needed. An amount cannot be less than what has already been received on it.
            </p>
            <Table stack flush>
              <thead>
                <tr>
                  <th>Demand</th>
                  <th>Status</th>
                  <th className="text-right">Received</th>
                  <th className="text-right">Amount: was</th>
                  <th className="text-right">Amount: new</th>
                  <th className="text-right">GST: was</th>
                  <th className="text-right">GST: new</th>
                </tr>
              </thead>
              <tbody>
                {proposal.rows.map((r) => (
                  <tr key={r.scheduleId}>
                    <Td label="Demand" className="font-medium">{r.description}</Td>
                    <Td label="Status"><StatusBadge kind="schedule" status={r.status} /></Td>
                    <Td label="Received" className="text-right">{formatCurrency(r.principalPaid + r.gstPaid)}</Td>
                    <Td label="Amount: was" className="text-right text-muted">{formatCurrency(r.oldPrincipal)}</Td>
                    <Td label="Amount: new" className="text-right">
                      <Input small type="number" inputMode="decimal" aria-label={`${r.description} new amount`} className="amount-input text-right" value={rows[r.scheduleId]?.principal ?? ''} onChange={(e) => setRow(r.scheduleId, 'principal', e.target.value)} />
                      <AmountInWords value={rows[r.scheduleId]?.principal} />
                    </Td>
                    <Td label="GST: was" className="text-right text-muted">{formatCurrency(r.oldGst)}</Td>
                    <Td label="GST: new" className="text-right">
                      <Input small type="number" inputMode="decimal" aria-label={`${r.description} new GST`} className="amount-input text-right" value={rows[r.scheduleId]?.gst ?? ''} onChange={(e) => setRow(r.scheduleId, 'gst', e.target.value)} />
                      <AmountInWords value={rows[r.scheduleId]?.gst} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="flex justify-between gap-3 wrap font-semibold">
              <span>Instalments add up to</span>
              <div className="text-right">{formatCurrency(total)}<AmountInWords value={total} /></div>
            </div>
            {totalOff && (
              <Alert variant="danger">
                The instalments add up to {formatCurrency(total)}, {proposal.instalmentsMatchValue ? 'not' : 'more than'} the new agreement value of {formatCurrency(newValue)}
              </Alert>
            )}
            {belowPaid && <Alert variant="danger">{belowPaid.description}: the new amount is less than what has already been received on it</Alert>}

            <div className="grid grid-2 gap-4">
              <TextField label="Stamp duty (₹)" type="number" min={0} value={stampDuty} onChange={(e) => setStampDuty(e.target.value)} hint={`${amountInWords(stampDuty) || 'None'}. Was ${formatCurrency(proposal.oldStampDuty)}`} />
              <TextField label="Registration (₹)" type="number" min={0} value={registration} onChange={(e) => setRegistration(e.target.value)} hint={`${amountInWords(registration) || 'None'}. Was ${formatCurrency(proposal.oldRegistration)}`} />
            </div>

            <TextareaField label="Reason for the correction" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: agreement value typed as 1,25,00,000 instead of 1,52,00,000" />
            <CheckboxField
              label="Send revised demand letters to the buyers"
              checked={sendLetters}
              onChange={(e) => setSendLetters(e.target.checked)}
              hint={letters > 0 ? `${plural(letters, 'demand')} already raised and not fully paid will be sent again with the new amount, by email and WhatsApp` : 'No demand already raised changes, so no letter would be sent'}
            />
          </>
        )}
      </div>
    </Modal>
  )
}
