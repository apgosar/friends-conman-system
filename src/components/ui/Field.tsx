import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
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
