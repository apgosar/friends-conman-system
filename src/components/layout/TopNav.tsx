'use client'

import { useSession } from 'next-auth/react'
import { ROLE_BADGES, ROLE_LABELS, normalizeRole } from '@/lib/roles'
import { useNav } from '@/components/layout/AppShell'
import { Badge, type BadgeVariant } from '@/components/ui'

/** The bar at the top of every page: menu button (phones), page title, and who is signed in. */
export default function TopNav({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { data: session } = useSession()
  const { open, toggle } = useNav()
  const role = normalizeRole(session?.user?.role)

  return (
    <header className="topnav">
      <div className="topnav-left min-w-0">
        <button type="button" className="mobile-menu-btn" onClick={toggle} aria-label="Open menu" aria-expanded={open}>☰</button>
        {title && (
          <div className="topnav-title min-w-0">
            <div className="topnav-heading truncate">{title}</div>
            {subtitle && <p className="truncate">{subtitle}</p>}
          </div>
        )}
      </div>
      <div className="topnav-right">
        {session?.user && (
          <div className="topnav-user">
            <Badge variant={ROLE_BADGES[role].replace('badge-', '') as BadgeVariant} className="hide-sm">{ROLE_LABELS[role]}</Badge>
            <div className="topnav-user-meta">
              <div className="topnav-user-name">{session.user.name}</div>
              <div className="topnav-user-email">{session.user.email}</div>
            </div>
            <div className="avatar" aria-hidden="true">{session.user.name?.[0]?.toUpperCase()}</div>
          </div>
        )}
      </div>
    </header>
  )
}
