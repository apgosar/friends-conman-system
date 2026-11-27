import { approveUpdate, cancelUpdate, isUpdateApprover, updateOverview } from '@/lib/app-update'
import { fail, route } from '@/lib/route'
import { z } from '@/lib/validate'

const approval = z.object({ version: z.string({ error: 'Enter a version such as v1.2.0' }).max(40) })

const onlyApprover = (user: { role: unknown; email: string }) => {
  if (!isUpdateApprover(user)) throw fail('forbidden')
}

const answer = async () => Response.json({ success: true, data: await updateOverview() })

// GET /api/settings/update: null for a Super Admin who is not the approver, so the card simply is not shown
export const GET = route('superadmin', async ({ user }) => (isUpdateApprover(user) ? answer() : Response.json({ success: true, data: null })))

// POST /api/settings/update: approve a version for the next daily job
export const POST = route('superadmin', async ({ user, body }) => {
  onlyApprover(user)
  const { version } = await body(approval)
  await approveUpdate(user.id, version)
  return answer()
})

// DELETE /api/settings/update: withdraw an approval that has not started
export const DELETE = route('superadmin', async ({ user }) => {
  onlyApprover(user)
  await cancelUpdate(user.id)
  return answer()
})
