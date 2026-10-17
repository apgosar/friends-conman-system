'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from './cn'

export interface TabItem<T extends string = string> { id: T; label: ReactNode; href?: string; badge?: ReactNode }

/**
 * Tabs. Give each item an `href` for navigation tabs (ProjectTabs), or pass `onChange` for in-page tabs.
 * Scrolls sideways on a phone instead of wrapping.
 */
export function Tabs<T extends string>({ items, active, onChange, label = 'Sections' }: { items: TabItem<T>[]; active: T; onChange?: (id: T) => void; label?: string }) {
  return (
    <div className="tabs" role={onChange ? 'tablist' : undefined} aria-label={label}>
      {items.map((item) => {
        const className = cn('tab', item.id === active && 'active')
        const content = <>{item.label}{item.badge}</>
        return item.href ? (
          <Link key={item.id} href={item.href} className={className} aria-current={item.id === active ? 'page' : undefined}>{content}</Link>
        ) : (
          <button key={item.id} type="button" role="tab" aria-selected={item.id === active} className={className} onClick={() => onChange?.(item.id)}>{content}</button>
        )
      })}
    </div>
  )
}
