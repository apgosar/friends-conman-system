/**
 * A − / + counter (the label is read by screen readers; show a heading next to it if sighted users need one) for small whole numbers (car parks, floors...). Not the multi-step progress bar: that is `StepBar`.
 * Controlled: pass `value` and `onChange`.
 */
export function Stepper({ label, value, onChange, min = 0, max = 99, hint, disabled }: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  hint?: string
  disabled?: boolean
}) {
  return (
    <div className="form-group">
      <div className="stepper-input" role="group" aria-label={label}>
        <button type="button" className="stepper-input-btn" aria-label={`One fewer: ${label}`} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <output className="stepper-input-value" aria-live="polite">{value}</output>
        <button type="button" className="stepper-input-btn" aria-label={`One more: ${label}`} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
      {hint && <span className="form-hint">{hint}</span>}
    </div>
  )
}
