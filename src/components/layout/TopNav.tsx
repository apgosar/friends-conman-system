'use client'

import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNav } from '@/components/layout/AppShell'
import UserMenu from '@/components/layout/UserMenu'

/** The bar at the top of every page: menu button, the page title (shown only here), and the signed-in person's menu. */
export default function TopNav({ title, subtitle }: { title?: string; subtitle?: ReactNode }) {
  const { open, toggle, collapsed, toggleCollapsed } = useNav()

  return (
    <header className="topnav">
      <div className="topnav-left min-w-0">
        <button type="button" className="mobile-menu-btn" onClick={toggle} aria-label="Open menu" aria-expanded={open}><Menu aria-hidden="true" /></button>
        <button type="button" className="sidebar-toggle-btn" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand the side bar' : 'Collapse the side bar'} aria-expanded={!collapsed} title={collapsed ? 'Expand the side bar' : 'Collapse the side bar'}>{collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}</button>
        {title && (
          <div className="topnav-title min-w-0">
            <h1 className="topnav-heading truncate">{title}</h1>
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
