'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'

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
  const role = session?.user?.role || 'SALES'

  // Filter NAV_ITEMS based on role
  const visibleNavItems = NAV_ITEMS.map(section => {
    let items = section.items
    
    // SALES cannot view Dashboard
    if (role === 'SALES' && section.section === 'Overview') {
      items = items.filter(i => i.href !== '/dashboard')
    }
    
    // Only SUPER_ADMIN can view Audit, Users, Settings
    if (role !== 'SUPER_ADMIN' && section.section === 'System') {
      items = items.filter(i => !['/audit', '/users', '/settings'].includes(i.href))
    }
    
    return { ...section, items }
  }).filter(section => section.items.length > 0)

  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="sidebar-logo">
        <div className="sidebar-logo-icon">BS</div>
        <div>
          <div className="sidebar-logo-text">
            BuildSight
            <span className="sidebar-logo-sub">Property Management</span>
          </div>
        </div>
      </Link>

      <nav className="sidebar-nav">
        {visibleNavItems.map((section) => (
          <div key={section.section}>
            <div className="nav-section-label">{section.section}</div>
            {section.items.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-item-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          className="nav-item w-full"
          style={{ border: 'none', cursor: 'pointer', background: 'transparent' }}
          onClick={() => signOut({ callbackUrl: '/login' })}
          id="signout-btn"
        >
          <span className="nav-item-icon">↩</span>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
