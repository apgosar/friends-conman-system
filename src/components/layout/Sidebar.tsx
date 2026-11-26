'use client'

import { Building2, ChartColumn, ClipboardList, History, Landmark, LayoutDashboard, MessagesSquare, Settings, SquarePlus, TriangleAlert, Users, Wallet } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { canAccessPath } from '@/lib/authz'
import { normalizeRole } from '@/lib/roles'
import { useNav } from '@/components/layout/AppShell'
import AppLogo from '@/components/layout/AppLogo'
import { cn } from '@/components/ui/cn'
import { activeNavHref } from '@/lib/nav'

const NAV_ITEMS = [
  {
    section: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    section: 'Projects',
    items: [
      { href: '/projects', label: 'All Projects', icon: Building2 },
      { href: '/projects/new', label: 'New Project', icon: SquarePlus },
    ],
  },
  {
    section: 'Sales',
    items: [
      { href: '/sales', label: 'All Sales', icon: ClipboardList },
      { href: '/sales/new', label: 'New Sale', icon: SquarePlus },
    ],
  },
  {
    section: 'Finance',
    items: [
      { href: '/payments', label: 'Payments', icon: Wallet },
      { href: '/escalations', label: 'Escalations', icon: TriangleAlert },
      { href: '/reports', label: 'Reports', icon: ChartColumn },
    ],
  },
  {
    section: 'System',
    items: [
      { href: '/communications', label: 'Communications', icon: MessagesSquare },
      { href: '/audit', label: 'Audit Log', icon: History },
      { href: '/users', label: 'Users', icon: Users },
      { href: '/companies', label: 'Companies', icon: Landmark },
      { href: '/settings', label: 'Settings', icon: Settings },
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

  const activeHref = activeNavHref(pathname, visibleNavItems.flatMap((s) => s.items.map((i) => i.href)))

  return (
    <>
      <div className={cn('mobile-overlay', open && 'open')} onClick={close} aria-hidden="true" />
      <aside className={cn('sidebar', open && 'open')} aria-label="Main navigation">
        <Link href="/dashboard" className="sidebar-logo" onClick={close} title="Neev CMS">
          <AppLogo className="sidebar-logo-icon" />
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
                const isActive = item.href === activeHref
                return (
                  <Link key={item.href} href={item.href} className={cn('nav-item', isActive && 'active')} onClick={close} title={item.label} aria-current={isActive ? 'page' : undefined}>
                    <span className="nav-item-icon" aria-hidden="true"><item.icon /></span>
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

      </aside>
    </>
  )
}
