'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { buildTitle, versionLabel } from '@/lib/version'
import { canAccessPath } from '@/lib/authz'
import { ROLE_LABELS, normalizeRole } from '@/lib/roles'
import { useNav } from '@/components/layout/AppShell'
import { cn } from '@/components/ui/cn'

const NAV_ITEMS = [
  {
    section: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: '▣' },
    ],
  },
  {
    section: 'Projects',
    items: [
      { href: '/projects', label: 'All Projects', icon: '🏢' },
      { href: '/projects/new', label: 'New Project', icon: '＋' },
    ],
  },
  {
    section: 'Sales',
    items: [
      { href: '/sales', label: 'All Sales', icon: '📋' },
      { href: '/sales/new', label: 'New Sale', icon: '＋' },
    ],
  },
  {
    section: 'Finance',
    items: [
      { href: '/payments', label: 'Payments', icon: '💳' },
      { href: '/escalations', label: 'Escalations', icon: '⚠' },
      { href: '/reports', label: 'Reports', icon: '📊' },
    ],
  },
  {
    section: 'System',
    items: [
      { href: '/communications', label: 'Communications', icon: '💬' },
      { href: '/audit', label: 'Audit Log', icon: '🔍' },
      { href: '/users', label: 'Users', icon: '👥' },
      { href: '/settings', label: 'Settings', icon: '⚙' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { open, close } = useNav()
  const role = normalizeRole(session?.user?.role)

  // Show exactly what the role may open (same policy table the proxy enforces), plus the long-standing rule
  // that the finance dashboard is not shown to the sales role.
  const visibleNavItems = NAV_ITEMS.map((section) => ({
    ...section,
    items: section.items.filter((i) => canAccessPath(role, i.href) && !(role === 'SALES' && i.href === '/dashboard')),
  })).filter((section) => section.items.length > 0)

  return (
    <>
      <div className={cn('mobile-overlay', open && 'open')} onClick={close} aria-hidden="true" />
      <aside className={cn('sidebar', open && 'open')} aria-label="Main navigation">
        <Link href="/dashboard" className="sidebar-logo" onClick={close} title="Neev CMS">
          <div className="sidebar-logo-icon">NC</div>
          <div className="sidebar-logo-text">
            Neev CMS
            <span className="sidebar-logo-sub">Property Management</span>
          </div>
        </Link>

        <nav className="sidebar-nav">
          {visibleNavItems.map((section) => (
            <div key={section.section}>
              <div className="nav-section-label">{section.section}</div>
              {section.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                return (
                  <Link key={item.href} href={item.href} className={cn('nav-item', isActive && 'active')} onClick={close} title={item.label} aria-current={isActive ? 'page' : undefined}>
                    <span className="nav-item-icon" aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {session?.user && (
            <div className="sidebar-user">
              <div className="sidebar-user-name">{session.user.name}</div>
              <div className="sidebar-user-meta">{ROLE_LABELS[role]}</div>
              <div className="sidebar-user-meta">{session.user.email}</div>
            </div>
          )}
          <Link href="/account" className={cn('nav-item', pathname.startsWith('/account') && 'active')} onClick={close} title="My Account">
            <span className="nav-item-icon" aria-hidden="true">🔑</span>
            <span>My Account</span>
          </Link>
          <button className="nav-item sidebar-signout" onClick={() => signOut({ callbackUrl: '/login' })} id="signout-btn" title="Sign Out">
            <span className="nav-item-icon" aria-hidden="true">↩</span>
            <span>Sign Out</span>
          </button>
          <div className="sidebar-version" title={buildTitle()}>{versionLabel()}</div>
        </div>
      </aside>
    </>
  )
}
