'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'
import Sidebar from '@/components/layout/Sidebar'
import { FeedbackProvider } from '@/components/ui'

interface NavState { open: boolean; toggle: () => void; close: () => void }
const NavContext = createContext<NavState | null>(null)

export const useNav = (): NavState => {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav must be used inside <AppShell>')
  return ctx
}

/** Everything around a signed-in page: session, sidebar (and its phone drawer), toasts and confirm dialogs. */
export default function AppShell({ session, children }: { session: Session; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((o) => !o), [])

  // the drawer closes when you navigate, and on Escape
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const value = useMemo(() => ({ open, toggle, close }), [open, toggle, close])

  return (
    <SessionProvider session={session}>
      <NavContext.Provider value={value}>
        <FeedbackProvider>
          <div className="admin-layout">
            <Sidebar />
            <div className="admin-main">{children}</div>
          </div>
        </FeedbackProvider>
      </NavContext.Provider>
    </SessionProvider>
  )
}
