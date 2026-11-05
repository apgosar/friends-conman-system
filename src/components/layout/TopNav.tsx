'use client'

import { useNav } from '@/components/layout/AppShell'
import UserMenu from '@/components/layout/UserMenu'

/** The bar at the top of every page: menu button, page title, and the signed-in person's menu. */
export default function TopNav({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { open, toggle, collapsed, toggleCollapsed } = useNav()

  return (
    <header className="topnav">
      <div className="topnav-left min-w-0">
        <button type="button" className="mobile-menu-btn" onClick={toggle} aria-label="Open menu" aria-expanded={open}>☰</button>
        <button type="button" className="sidebar-toggle-btn" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand the side bar' : 'Collapse the side bar'} aria-expanded={!collapsed} title={collapsed ? 'Expand the side bar' : 'Collapse the side bar'}>☰</button>
        {title && (
          <div className="topnav-title min-w-0">
            <div className="topnav-heading truncate">{title}</div>
            {subtitle && <p className="truncate">{subtitle}</p>}
          </div>
        )}
      </div>
      <div className="topnav-right">
        <UserMenu />
      </div>
    </header>
  )
}
