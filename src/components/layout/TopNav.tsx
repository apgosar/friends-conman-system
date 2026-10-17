'use client'

import { useSession } from 'next-auth/react'
import { ROLE_BADGES, ROLE_LABELS, normalizeRole } from '@/lib/roles'

export default function TopNav({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { data: session } = useSession()

  const toggleSidebar = () => {
    document.querySelector('.sidebar')?.classList.toggle('open')
    document.querySelector('.mobile-overlay')?.classList.toggle('open')
  }

  return (
    <header className="topnav">
      <div className="topnav-left">
        <button className="mobile-menu-btn" onClick={toggleSidebar}>
          ☰
        </button>
        {title && (
          <div>
            <h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>{title}</h1>
            {subtitle && <p style={{ fontSize: '0.8125rem', margin: 0 }}>{subtitle}</p>}
          </div>
        )}
      </div>
      <div className="topnav-right">
        {session?.user && (
          <div className="flex items-center gap-3">
            <span className={`badge ${ROLE_BADGES[normalizeRole(session.user.role)]}`}>
              {ROLE_LABELS[normalizeRole(session.user.role)]}
            </span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{session.user.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{session.user.email}</div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.875rem',
                color: '#fff',
                flexShrink: 0,
              }}
            >
              {session.user.name?.[0]?.toUpperCase()}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
