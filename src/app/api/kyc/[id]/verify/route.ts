import { prisma } from '@/lib/db'
import { route } from '@/lib/route'

// KycDocument writes are audited automatically (lib/prisma-extension.ts), so there is no manual audit entry here.
export const POST = route<{ id: string }>('admin', async ({ params }) => {
  // a missing document makes Prisma throw P2025, which route() answers with "Not found"
  const doc = await prisma.kycDocument.update({ where: { id: params.id }, data: { status: 'VERIFIED', verifiedAt: new Date() } })
  return Response.json({ success: true, data: doc })
})
