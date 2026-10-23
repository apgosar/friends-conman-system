'use client'

import Link from 'next/link'
import { Alert, CheckboxField } from '@/components/ui'

export interface PartnerChoice { id: string; name: string }

/** What is chosen when nothing was picked yet: all the partners. */
export const defaultPartnerIds = (partners: PartnerChoice[]): string[] => partners.map((p) => p.id)

/**
 * "Which partners sign this agreement?" Any number of the company's partners can be named, depending on who is available
 * when the agreement is registered.
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

  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((v) => v !== id))

  return (
    <div className="panel mb-4 text-left">
      <div className="font-semibold mb-1">Partners signing the agreement</div>
      <p className="text-sm text-muted mb-3">Choose the partners to name in the agreement: one, several or all of them.</p>
      <div className="flex dir-col gap-2">
        {partners.map((p, i) => (
          <CheckboxField
            key={p.id}
            label={p.name}
            checked={value.includes(p.id)}
            aria-invalid={error && i === 0 ? true : undefined}
            onChange={(e) => toggle(p.id, e.target.checked)}
          />
        ))}
      </div>
      <p className="text-sm text-muted mt-2">{value.length} of {partners.length} chosen</p>
      {error && <p className="field-error mt-2" role="alert">{error}</p>}
    </div>
  )
}
