import type { HTMLAttributes, ReactNode, TdHTMLAttributes } from 'react'
import { cn } from './cn'

/**
 * A table that scrolls sideways inside its own box instead of stretching the page.
 * `stack` turns it into one card per row on a phone: give each <Td> a `label` (the column name) and it is shown beside the value.
 * `flush` removes the border, for a table that sits inside a Card.
 */
export function Table({ children, stack, flush, className, ...rest }: { children: ReactNode; stack?: boolean; flush?: boolean } & HTMLAttributes<HTMLTableElement>) {
  return (
    <div className={cn('table-wrapper', flush && 'table-wrapper-flush')} data-scroll>
      <table className={cn(stack && 'table-stack', className)} {...rest}>{children}</table>
    </div>
  )
}

/** A body cell. Pass `label` when the table is `stack`ed; use label="" to hide a cell (an action column) in card mode. */
export function Td({ label, className, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { label?: string }) {
  return <td data-label={label} className={className} {...rest} />
}
