'use client'

import { useSession } from 'next-auth/react'

export default function TopNav({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { data: session } = useSession()
  const roleColors: Record<string, string> = {
    SUPER_ADMIN: 'badge-primary',
    SALES_MANAGER: 'badge-info',
    ACCOUNTS: 'badge-success',
    MANAGEMENT: 'badge-warning',
    VIEWER: 'badge-muted',
  }
  const roleLabel: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    SALES_MANAGER: 'Sales Manager',
    ACCOUNTS: 'Accounts',
    MANAGEMENT: 'Management',
    VIEWER: 'Viewer',
  }

  return (
    <header className="topnav">
      <div className="topnav-left">
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
            <span className={`badge ${roleColors[session.user.role] ?? 'badge-muted'}`}>
              {roleLabel[session.user.role] ?? session.user.role}
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
