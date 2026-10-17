import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/guard'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const session = { user: guard.user }
  
  const { id } = await props.params

  try {
    const doc = await prisma.kycDocument.update({
      where: { id },
      data: {
        status: 'VERIFIED',
        verifiedAt: new Date(),
      }
    })
    
    // Check if all docs for this buyer are verified, we could update Buyer status
    // Check if all buyers for the sale are verified, we could update Sale status to KYC_DONE
    // (For this mock, updating the doc is enough to demonstrate the UI change)
    
    return Response.json({ success: true, data: doc })
  } catch (err: any) {
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
