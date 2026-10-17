'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

/** A table row that opens `href` when clicked (and with Enter, for keyboard users). */
export default function ClickableRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter()
  return (
    <tr
      className="row-link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => { if (e.key === 'Enter') router.push(href) }}
    >
      {children}
    </tr>
  )
}
