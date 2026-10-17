import { apiError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/guard'
import { parseBody, z } from '@/lib/validate'
import { hashPassword, validatePassword } from '@/lib/password'
import { passwordRateLimit, rateLimitExceeded } from '@/lib/rate-limit'
import { createAuditLog } from '@/lib/audit'

const Schema = z.object({ newPassword: z.string().min(1, 'Enter a new password') })

// POST /api/users/[id]/password — a Super Admin sets a new password for someone (they are signed out everywhere)
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('superadmin')
  if ('error' in guard) return guard.error
  const { id } = await props.params

  const rl = await passwordRateLimit(req, guard.user.id)
  if (!rl.ok) return rateLimitExceeded(rl.reset)

  const { data, error } = await parseBody(req, Schema)
  if (error) return error

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } })
  if (!target) return apiError('notFound', 'User not found')

  const weak = validatePassword(data.newPassword, target)
  if (weak) return apiError('invalid', weak)

  await prisma.user.update({
    where: { id },
    data: { password: await hashPassword(data.newPassword), passwordChangedAt: new Date(), tokenVersion: { increment: 1 } },
  })
  await createAuditLog({ userId: guard.user.id, entityType: 'user', entityId: id, action: 'password_reset' })
  return Response.json({ success: true })
}
