'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

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

  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="sidebar-logo">
        <div className="sidebar-logo-icon">FC</div>
        <div>
          <div className="sidebar-logo-text">
            Friends ConMan
            <span className="sidebar-logo-sub">Property Management</span>
          </div>
        </div>
      </Link>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((section) => (
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
