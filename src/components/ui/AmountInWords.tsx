import { amountInWords } from '@/lib/format'
import { cn } from './cn'

/**
 * An amount in words under a figure ("Rupees Ten Lakh Only"), so the person can check what they typed or are about to
 * confirm. Shows nothing for an empty or zero amount. On a form field, pass `amountInWords(value)` as its `hint` instead.
 */
export function AmountInWords({ value, className }: { value: number | string | null | undefined; className?: string }) {
  const words = amountInWords(value)
  return words ? <div className={cn('amount-words', className)}>{words}</div> : null
}
