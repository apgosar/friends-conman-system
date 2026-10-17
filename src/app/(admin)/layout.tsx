import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) {
    redirect('/login')
  }

  return <AppShell session={session}>{children}</AppShell>
}
