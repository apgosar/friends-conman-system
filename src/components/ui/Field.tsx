import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { joinPhone, sanitizeCountryCode, sanitizePhoneInput, splitPhone } from '@/lib/phone'
import { cn } from './cn'

/**
 * Form controls. `Input`, `Select` and `Textarea` are the bare controls (use them inside tables or toolbars).
 * `TextField`, `SelectField`, `TextareaField` and `CheckboxField` add the label, hint and error and connect them to the
 * control (for / id / aria-describedby), so every form in the app looks and behaves the same and is readable by screen readers.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; small?: boolean }>(function Input(
  { className, invalid, small, ...rest },
  ref,
) {
  return <input ref={ref} className={cn('form-input', small && 'form-input-sm', className)} aria-invalid={invalid || undefined} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; small?: boolean }>(function Select(
  { className, invalid, small, ...rest },
  ref,
) {
  return <select ref={ref} className={cn('form-select', small && 'form-select-sm', className)} aria-invalid={invalid || undefined} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn('form-textarea', className)} aria-invalid={invalid || undefined} {...rest} />
})

interface FieldChrome {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  /** Class for the wrapper (e.g. to span columns). */
  wrapperClassName?: string
}

function FieldShell({ id, label, hint, error, required, wrapperClassName, children }: FieldChrome & { id: string; children: ReactNode }) {
  return (
    <div className={cn('form-group', wrapperClassName)}>
      <label className="form-label" htmlFor={id}>
        {label}
        {required && <span className="form-required" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <span className="form-hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="field-error" id={`${id}-error`} role="alert">{error}</span>}
    </div>
  )
}

const describedBy = (id: string, hint: ReactNode, error: ReactNode) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined)

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldChrome>(function TextField(
  { label, hint, error, required, wrapperClassName, id, className, ...rest },
  ref,
) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required} wrapperClassName={wrapperClassName}>
      <Input ref={ref} id={fieldId} className={className} required={required} invalid={!!error} aria-describedby={describedBy(fieldId, hint, error)} {...rest} />
    </FieldShell>
  )
})

/**
 * A mobile / WhatsApp number. Shows "+91 " when empty so an Indian number is just typed in; the prefix can be edited for a
 * number from another country. `value` is what the form holds (empty, a bare 10-digit number, or whatever was typed): check it
 * with normalizePhone() from lib/phone.ts before saving.
 */
type PhoneBoxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { value: string; onValueChange: (value: string) => void; invalid?: boolean; small?: boolean }

/** The two boxes: country code (editable, "+91" to start) and number. */
const PhoneBoxes = forwardRef<HTMLInputElement, PhoneBoxProps>(function PhoneBoxes({ value, onValueChange, invalid, small, className, ...rest }, ref) {
  const { code, number } = splitPhone(value)
  return (
    <div className="phone-row">
      <Input className="phone-code" small={small} invalid={invalid} aria-label="Country code" inputMode="tel" maxLength={5} value={code} onChange={(e) => onValueChange(joinPhone(sanitizeCountryCode(e.target.value), number))} />
      <Input ref={ref} className={className} small={small} invalid={invalid} type="tel" inputMode="tel" autoComplete="tel-national" value={number} onChange={(e) => onValueChange(joinPhone(code, sanitizePhoneInput(e.target.value)))} {...rest} />
    </div>
  )
})

export const PhoneField = forwardRef<HTMLInputElement, Omit<PhoneBoxProps, 'invalid' | 'small'> & FieldChrome>(function PhoneField(
  { label, hint, error, required, wrapperClassName, id, className, ...rest },
  ref,
) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required} wrapperClassName={wrapperClassName}>
      <PhoneBoxes ref={ref} id={fieldId} className={className} required={required} invalid={!!error} aria-describedby={describedBy(fieldId, hint, error)} {...rest} />
    </FieldShell>
  )
})

/** The bare version of PhoneField, for toolbars and tables (no label, hint or error). */
export const PhoneInput = PhoneBoxes

export const SelectField = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldChrome>(function SelectField(
  { label, hint, error, required, wrapperClassName, id, className, children, ...rest },
  ref,
) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required} wrapperClassName={wrapperClassName}>
      <Select ref={ref} id={fieldId} className={className} required={required} invalid={!!error} aria-describedby={describedBy(fieldId, hint, error)} {...rest}>
        {children}
      </Select>
    </FieldShell>
  )
})

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldChrome>(function TextareaField(
  { label, hint, error, required, wrapperClassName, id, className, ...rest },
  ref,
) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required} wrapperClassName={wrapperClassName}>
      <Textarea ref={ref} id={fieldId} className={className} required={required} invalid={!!error} aria-describedby={describedBy(fieldId, hint, error)} {...rest} />
    </FieldShell>
  )
})

/** A choice of one out of a few, as radio buttons (use instead of a drop-down when there are only two or three options). */
export function RadioGroupField({ label, name, value, onChange, options, hint, wrapperClassName }: {
  label: ReactNode
  name: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: ReactNode }[]
  hint?: ReactNode
  wrapperClassName?: string
}) {
  const id = useId()
  return (
    <div className={cn('form-group', wrapperClassName)} role="radiogroup" aria-labelledby={`${id}-label`}>
      <span className="form-label" id={`${id}-label`}>{label}</span>
      <div className="flex gap-3 wrap">
        {options.map((o) => (
          <label key={o.value} className={cn('radio-card', value === o.value && 'is-selected')}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
      {hint && <span className="form-hint">{hint}</span>}
    </div>
  )
}

/** An on/off switch, green when on and red when off, with a word for each state beside it ("Communication On" / "Communication Off"). */
export const SwitchField = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { onLabel: string; offLabel: string }>(function SwitchField(
  { onLabel, offLabel, id, className, checked, ...rest },
  ref,
) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <label className={cn('switch-field', className)} htmlFor={fieldId}>
      <input ref={ref} id={fieldId} type="checkbox" role="switch" className="switch-input" checked={checked} {...rest} />
      <span className="switch-track" aria-hidden="true" />
      <span className={checked ? 'switch-text-on' : 'switch-text-off'}>{checked ? onLabel : offLabel}</span>
    </label>
  )
})

export const CheckboxField = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; hint?: ReactNode }>(function CheckboxField(
  { label, hint, id, className, ...rest },
  ref,
) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <label className={cn('check-field', className)} htmlFor={fieldId}>
      <input ref={ref} id={fieldId} type="checkbox" {...rest} />
      <span>
        {label}
        {hint && <span className="form-hint check-hint">{hint}</span>}
      </span>
    </label>
  )
})
