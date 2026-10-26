'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useConfirm, useToast } from '@/components/ui'
import { errorMessage, fetchJson } from '@/lib/client/api'
import { FLOOR_PLAN_ACCEPT } from '@/lib/floor-plan'

/** The company's letterhead for quotations: an A4 image with the logo and address, printed behind each quotation. */
export default function CompanyLetterhead({ companyId, letterheadUrl, topMm, bottomMm }: { companyId: string; letterheadUrl: string | null; topMm: number; bottomMm: number }) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      await fetchJson(`/api/companies/${companyId}/letterhead`, { method: 'POST', body })
      toast.success('Letterhead saved. New and edited quotations use it')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const remove = async () => {
    const ok = await confirm({ title: 'Remove the letterhead?', message: 'Quotations go back to a plain page.', confirmLabel: 'Remove', danger: true })
    if (!ok) return
    setBusy(true)
    try {
      await fetchJson(`/api/companies/${companyId}/letterhead`, { method: 'DELETE' })
      toast.success('Letterhead removed')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="detail-tile mb-4">
      <div className="flex justify-between items-center gap-3 wrap mb-2">
        <div className="label-caps">Quotation letterhead</div>
        <div className="flex gap-2">
          <Button size="sm" loading={busy} onClick={() => input.current?.click()}>{letterheadUrl ? 'Replace' : 'Upload letterhead'}</Button>
          {letterheadUrl && <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={remove}>Remove</Button>}
        </div>
      </div>
      <input ref={input} type="file" hidden accept={FLOOR_PLAN_ACCEPT} onChange={(e) => upload(e.target.files?.[0])} />
      {letterheadUrl ? (
        <div className="flex gap-4 wrap items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={letterheadUrl} alt="Letterhead" className="letterhead-thumb" />
          <p className="text-sm text-muted m-0">Quotations are printed on this A4 image. The text keeps {topMm} mm clear at the top and {bottomMm} mm at the bottom; change these by editing the company.</p>
        </div>
      ) : (
        <p className="text-sm text-muted m-0">Not added: quotations print on a plain page. Upload your A4 letterhead (PNG or JPG, up to 5 MB) with the logo and address.</p>
      )}
    </div>
  )
}
