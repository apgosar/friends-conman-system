'use client'

import { Button } from './Button'

export interface ChipOption<T extends string = string> { value: T; label: string }

/** A row of mutually exclusive filter buttons with a label: Channel: [All] [Email] [WhatsApp]. */
export function FilterChips<T extends string>({ label, options, value, onChange }: { label: string; options: ChipOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="row gap-2" role="group" aria-label={label}>
      <span className="text-sm text-muted">{label}:</span>
      {options.map((o) => (
        <Button key={o.value} size="sm" variant={value === o.value ? 'primary' : 'secondary'} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</Button>
      ))}
    </div>
  )
}
