'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'

/** Super Admin only: erase one buyer's personal data on request (DPDP Act). The sale and its payments stay. */
export default function AnonymizeBuyerButton({ buyerId, buyerName }: { buyerId: string; buyerName: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function erase() {
    const ok = await confirm({
      title: `Erase personal data of ${buyerName}?`,
      message: 'The name, contact details, PAN, Aadhaar and KYC documents are removed for good. The sale and its payments stay. This cannot be undone.',
      confirmLabel: 'Erase personal data',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const { data } = await fetchJson(`/api/buyers/${buyerId}/anonymize`, jsonRequest('POST', { confirm: true }))
      toast.success('Personal data erased')
      if (data.filesNotDeleted > 0) toast.warning(`${data.filesNotDeleted} stored file(s) could not be deleted. Ask your administrator to remove them`)
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return <button type="button" className="link-btn link-btn-danger" disabled={busy} onClick={erase}>Erase personal data</button>
}
