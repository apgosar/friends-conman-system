'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'
import Sidebar from '@/components/layout/Sidebar'
import { FeedbackProvider, FormEffects } from '@/components/ui'
import { cn } from '@/components/ui/cn'

const COLLAPSED_KEY = 'neev.sidebar-collapsed'

// The collapsed choice lives in the browser (read after hydration, so server and client markup match)
let collapsedNow = false
const listeners = new Set<() => void>()
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSED_KEY) === '1' } catch { return collapsedNow } }
const subscribeCollapsed = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }
const writeCollapsed = (value: boolean) => {
  collapsedNow = value
  try { localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0') } catch { /* not remembered */ }
  listeners.forEach((cb) => cb())
}

interface NavState { open: boolean; toggle: () => void; close: () => void; collapsed: boolean; toggleCollapsed: () => void }
const NavContext = createContext<NavState | null>(null)

export const useNav = (): NavState => {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav must be used inside <AppShell>')
  return ctx
}

/** Everything around a signed-in page: session, sidebar (and its phone drawer), toasts and confirm dialogs. */
export default function AppShell({ session, children }: { session: Session; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false) // the desktop side bar as a narrow rail
  const pathname = usePathname()
  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((o) => !o), [])

  const toggleCollapsed = useCallback(() => writeCollapsed(!readCollapsed()), [])

  // the drawer closes when you navigate, and on Escape
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const value = useMemo(() => ({ open, toggle, close, collapsed, toggleCollapsed }), [open, toggle, close, collapsed, toggleCollapsed])

  return (
    <SessionProvider session={session}>
      <NavContext.Provider value={value}>
        <FeedbackProvider>
          <FormEffects />
          <div className={cn('admin-layout', collapsed && 'collapsed')}>
            <Sidebar />
            <div className="admin-main">{children}</div>
          </div>
        </FeedbackProvider>
      </NavContext.Provider>
    </SessionProvider>
  )
}
