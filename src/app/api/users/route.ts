import { apiError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/guard'
import { parseBody, z } from '@/lib/validate'
import { ROLES } from '@/lib/roles'
import { hashPassword, validatePassword } from '@/lib/password'
import { createAuditLog } from '@/lib/audit'
import { logger } from '@/lib/logger'

const USER_FIELDS = { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } as const

// GET /api/users
export async function GET() {
  const guard = await requireRole('superadmin')
  if ('error' in guard) return guard.error

  const users = await prisma.user.findMany({ select: USER_FIELDS, orderBy: { createdAt: 'desc' } })
  return Response.json({ success: true, data: users })
}

const CreateUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(200),
  role: z.enum(ROLES, { message: 'Choose a valid role' }),
  password: z.string().min(1, 'Password is required'),
})

// POST /api/users
export async function POST(req: NextRequest) {
  const guard = await requireRole('superadmin')
  if ('error' in guard) return guard.error

  const { data, error } = await parseBody(req, CreateUserSchema)
  if (error) return error

  const weak = validatePassword(data.password, data)
  if (weak) return apiError('invalid', weak)

  const existing = await prisma.user.findFirst({ where: { email: { equals: data.email, mode: 'insensitive' } }, select: { id: true } })
  if (existing) return apiError('conflict', 'A user with this email already exists')

  try {
    const user = await prisma.user.create({
      data: { name: data.name, email: data.email, role: data.role, password: await hashPassword(data.password), passwordChangedAt: new Date() },
      select: USER_FIELDS,
    })
    await createAuditLog({ userId: guard.user.id, entityType: 'user', entityId: user.id, action: 'created', newValues: { email: user.email, role: user.role } })
    return Response.json({ success: true, data: user }, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'User creation failed')
    return apiError('server', 'Could not create the user')
  }
}
