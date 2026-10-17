import Link from 'next/link'
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

const classes = (variant: ButtonVariant, size: ButtonSize, extra?: { block?: boolean; loading?: boolean; icon?: boolean; className?: string }) =>
  cn('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, extra?.block && 'btn-block', extra?.icon && 'btn-icon', extra?.loading && 'is-loading', extra?.className)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner and blocks clicks while something is happening. */
  loading?: boolean
  block?: boolean
  /** Square icon-only button; pass an aria-label. */
  icon?: boolean
}

/** The one button. `type` defaults to "button", so a button inside a <form> only submits when you say type="submit". */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, block, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={classes(variant, size, { block, loading, icon, className })} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  )
})

export interface ButtonLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  children: ReactNode
}

/** A link that looks like a Button (navigation, not an action). */
export function ButtonLink({ href, variant = 'secondary', size = 'md', block, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link href={href} className={classes(variant, size, { block, className })} {...rest}>
      {children}
    </Link>
  )
}
