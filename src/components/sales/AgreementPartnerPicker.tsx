'use client'

import Link from 'next/link'
import { Alert, CheckboxField } from '@/components/ui'
import { AGREEMENT_PARTNERS } from '@/lib/companies'

export interface PartnerChoice { id: string; name: string }

/** What is chosen when nothing was picked yet: with no more partners than an agreement names, all of them. */
export const defaultPartnerIds = (partners: PartnerChoice[]): string[] => (partners.length <= AGREEMENT_PARTNERS ? partners.map((p) => p.id) : [])

/**
 * "Which partners sign this agreement?" A company may have 4 or 5 partners and any 2 of them are named, depending on who is
 * available when the agreement is registered. With two partners or fewer there is nothing to choose.
 */
export default function AgreementPartnerPicker({ partners, value, onChange, error }: {
  partners: PartnerChoice[]
  value: string[]
  onChange: (ids: string[]) => void
  error?: string
}) {
  if (partners.length === 0) {
    return (
      <Alert variant="warning" className="mb-4" title="No partners for this company yet">
        The agreement will be generated without partner names. Add the partners under <Link href="/companies" className="text-brand">Companies</Link> to name them.
      </Alert>
    )
  }

  const choose = partners.length > AGREEMENT_PARTNERS
  const full = value.length >= AGREEMENT_PARTNERS
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((v) => v !== id))

  return (
    <div className="panel mb-4 text-left">
      <div className="font-semibold mb-1">Partners signing the agreement</div>
      <p className="text-sm text-muted mb-3">
        {choose ? `Choose ${AGREEMENT_PARTNERS} of the ${partners.length} partners to name in the agreement.` : `${partners.length === 1 ? 'This partner is' : 'These partners are'} named in the agreement.`}
      </p>
      <div className="flex dir-col gap-2">
        {partners.map((p, i) => (
          <CheckboxField
            key={p.id}
            label={p.name}
            checked={value.includes(p.id)}
            disabled={!choose || (full && !value.includes(p.id))}
            aria-invalid={error && i === 0 ? true : undefined}
            onChange={(e) => toggle(p.id, e.target.checked)}
          />
        ))}
      </div>
      {choose && <p className="text-sm text-muted mt-2">{value.length} of {AGREEMENT_PARTNERS} chosen</p>}
      {error && <p className="field-error mt-2" role="alert">{error}</p>}
    </div>
  )
}
