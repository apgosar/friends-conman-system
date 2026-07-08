'use client'

import { useRouter } from 'next/navigation'
import React from 'react'

export default function ClickableRow({ href, children }: { href: string, children: React.ReactNode }) {
  const router = useRouter()
  return (
    <tr 
      onClick={() => router.push(href)}
      style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-muted, #f3f4f6)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {children}
    </tr>
  )
}
