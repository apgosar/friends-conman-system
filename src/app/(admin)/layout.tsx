import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import { SessionProvider } from 'next-auth/react'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) {
    redirect('/login')
  }

  return (
    <SessionProvider session={session}>
      <div className="admin-layout">
        <Sidebar />
        <div className="admin-main">
          {children}
        </div>
      </div>
    </SessionProvider>
  )
}
