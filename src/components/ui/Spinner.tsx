import { cn } from './cn'

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return <span className={cn('spinner', className)} role="status" aria-label={label} />
}
