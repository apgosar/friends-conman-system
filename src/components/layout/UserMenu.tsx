'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { ROLE_LABELS, normalizeRole } from '@/lib/roles'
import { APP_VERSION, BUILD_SHA, BUILD_TIME } from '@/lib/version'
import { formatDateTimeLong } from '@/lib/format'
import { Button, Modal } from '@/components/ui'

/** The signed-in person's menu in the top bar: My Account, About (version) and Log Out. */
export default function UserMenu() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [about, setAbout] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  if (!session?.user) return null
  const role = normalizeRole(session.user.role)
  const builtAt = BUILD_TIME && !isNaN(new Date(BUILD_TIME).getTime()) ? formatDateTimeLong(new Date(BUILD_TIME)) : BUILD_TIME

  return (
    <div className="user-menu" ref={box}>
      <button type="button" className="user-menu-trigger" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} id="user-menu-btn">
        <span className="topnav-user-name hide-sm">{session.user.name}</span>
        <span className="avatar" aria-hidden="true">{session.user.name?.[0]?.toUpperCase()}</span>
        <span className="user-menu-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-head">
            <div className="user-menu-name">{session.user.name}</div>
            <div className="user-menu-meta">{ROLE_LABELS[role]}</div>
            <div className="user-menu-meta">{session.user.email}</div>
          </div>
          <Link href="/account" className="user-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <span className="nav-item-icon" aria-hidden="true">🔑</span>My Account
          </Link>
          <button type="button" className="user-menu-item" role="menuitem" onClick={() => { setOpen(false); setAbout(true) }}>
            <span className="nav-item-icon" aria-hidden="true">ℹ</span>About
          </button>
          <button type="button" className="user-menu-item" role="menuitem" id="signout-btn" onClick={() => signOut({ callbackUrl: '/login' })}>
            <span className="nav-item-icon" aria-hidden="true">↩</span>Log Out
          </button>
        </div>
      )}

      {about && (
        <Modal title="About Neev CMS" subtitle="Property management" size="sm" onClose={() => setAbout(false)} footer={<Button variant="secondary" onClick={() => setAbout(false)}>Close</Button>}>
          <dl className="about-list">
            <dt>Version</dt><dd>{APP_VERSION}</dd>
            {BUILD_SHA && (<><dt>Build</dt><dd>{BUILD_SHA}</dd></>)}
            {builtAt && (<><dt>Built</dt><dd>{builtAt}</dd></>)}
          </dl>
        </Modal>
      )}
    </div>
  )
}
