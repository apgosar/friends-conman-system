import { apiError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/guard'
import { parseBody, z } from '@/lib/validate'
import { hashPassword, validatePassword, verifyPassword } from '@/lib/password'
import { passwordRateLimit, rateLimitExceeded } from '@/lib/rate-limit'
import { createAuditLog } from '@/lib/audit'

const Schema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(1, 'Enter a new password'),
})

// POST /api/account/password — change your own password. Every session (including this one) is ended afterwards.
export async function POST(req: NextRequest) {
  const guard = await requireRole('any')
  if ('error' in guard) return guard.error

  const rl = await passwordRateLimit(req, guard.user.id)
  if (!rl.ok) return rateLimitExceeded(rl.reset)

  const { data, error } = await parseBody(req, Schema)
  if (error) return error

  const user = await prisma.user.findUnique({ where: { id: guard.user.id }, select: { id: true, name: true, email: true, password: true } })
  if (!user) return apiError('notFound', 'User not found')

  if (!(await verifyPassword(data.currentPassword, user.password))) {
    return apiError('invalid', 'Your current password is not correct')
  }
  if (data.newPassword === data.currentPassword) {
    return apiError('invalid', 'Choose a password different from your current one')
  }
  const weak = validatePassword(data.newPassword, user)
  if (weak) return apiError('invalid', weak)

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await hashPassword(data.newPassword), passwordChangedAt: new Date(), tokenVersion: { increment: 1 } },
  })
  await createAuditLog({ userId: user.id, entityType: 'user', entityId: user.id, action: 'password_changed' })
  return Response.json({ success: true })
}
