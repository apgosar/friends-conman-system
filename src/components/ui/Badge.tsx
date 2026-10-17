import type { ReactNode } from 'react'
import { cn } from './cn'
import {
  COMM_STATUS, DOCUMENT_STATUS, KYC_STATUS, MILESTONE_STATUS, PROJECT_STATUS, PROJECT_TYPE, SALE_STATUS, SCHEDULE_STATUS, UNIT_STATUS,
  type StatusStyle,
} from '@/lib/status'

export type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'orange' | 'muted'

export function Badge({ variant = 'muted', children, className, title }: { variant?: BadgeVariant; children: ReactNode; className?: string; title?: string }) {
  return <span className={cn('badge', `badge-${variant}`, className)} title={title}>{children}</span>
}

const REGISTRIES = {
  unit: UNIT_STATUS,
  sale: SALE_STATUS,
  schedule: SCHEDULE_STATUS,
  comm: COMM_STATUS,
  document: DOCUMENT_STATUS,
  milestone: MILESTONE_STATUS,
  kyc: KYC_STATUS,
  project: PROJECT_STATUS,
  projectType: PROJECT_TYPE,
} as const satisfies Record<string, Record<string, StatusStyle>>

const humanize = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

/** A status shown the same way on every screen: label and colour come from lib/status.ts, never from the caller. */
export function StatusBadge({ kind, status, className }: { kind: keyof typeof REGISTRIES; status: string; className?: string }) {
  const style = (REGISTRIES[kind] as Record<string, StatusStyle>)[status]
  return <span className={cn('badge', style?.badge ?? 'badge-muted', className)}>{style?.label ?? humanize(status)}</span>
}
