import { route } from '@/lib/route'
import { softDelete } from '@/lib/soft-delete'

export const DELETE = route<{ id: string }>('admin', async ({ params, user }) => {
  await softDelete.document(params.id, { userId: user.id })
  return Response.json({ success: true })
})
