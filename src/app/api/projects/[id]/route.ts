import { apiError, apiServerError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { requireRole } from '@/lib/guard'
import { parsePricingSettings } from '@/lib/pricing-settings'
import { createAuditLog } from '@/lib/audit'
import { activeSale } from '@/lib/soft-delete'
import { CONTACT_NUMBERS_ERROR } from '@/lib/companies'
import { normalizePhoneList } from '@/lib/phone'
import { HttpError } from '@/lib/errors'
import { deleteProject } from '@/lib/projects/delete-project'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return apiError('unauthorized')

  const { id } = await props.params
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      wings: { include: { floors: { include: { units: true } } } },
      milestones: { orderBy: { sequence: 'asc' } },
      templates: { where: { isActive: true } },
      _count: { select: { sales: { where: activeSale } } },
    },
  })
  if (!project) return apiError('notFound')
  return Response.json({ success: true, data: project })
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const session = { user: guard.user }

  const { id } = await props.params
  const body = await req.json()

  const {
    name, reraNumber, address, city, state, type, status,
    companyId,
    carParkingCharges, carParkingIncluded,
    launchDate, expectedCompletion,
  } = body

  const contact = body.contactNumbers === undefined ? undefined : normalizePhoneList(String(body.contactNumbers ?? ''))
  if (contact && !contact.ok) return apiError('invalid', CONTACT_NUMBERS_ERROR)
  // Numbers the same as the company's mean "use the company's", so a later change to the company's numbers reaches this project too
  if (contact?.ok && contact.value) {
    const owner = await prisma.company.findFirst({ where: companyId ? { id: String(companyId) } : { projects: { some: { id } } }, select: { contactNumbers: true } })
    if (owner?.contactNumbers === contact.value) contact.value = null
  }
  if (companyId && !(await prisma.company.findUnique({ where: { id: String(companyId) }, select: { id: true } }))) return apiError('invalid', 'Choose a company from the list')
  const pricing = parsePricingSettings(body)
  if (pricing.error) return apiError('invalid', pricing.error)

  try {
    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...(name && { name }),
        reraNumber: reraNumber ?? null,
        ...(address && { address }),
        ...(city && { city }),
        ...(state && { state }),
        ...(type && { type }),
        ...(status && { status }),
        ...(companyId && { companyId: String(companyId) }),
        ...(contact?.ok && { contactNumbers: contact.value }), // empty = use the company's
        ...pricing.data,
        ...(carParkingCharges !== undefined && { carParkingCharges: parseFloat(carParkingCharges) }),
        ...(typeof carParkingIncluded === 'boolean' && { carParkingIncluded }),
        ...(launchDate && { launchDate: new Date(launchDate) }),
        ...(expectedCompletion && { expectedCompletion: new Date(expectedCompletion) }),
      },
    })

    await createAuditLog({
      userId: session.user.id,
      projectId: id,
      entityType: 'project',
      entityId: id,
      action: 'updated',
      newValues: { name, type, status, ...pricing.data },
    })

    return Response.json({ success: true, data: updated })
  } catch (err) {
    return apiServerError(err, 'projects/[id]')
  }
}

// DELETE /api/projects/[id]: Super Admin only. Deletes the project and everything under it, its sales included (see deleteProject)
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('superadmin')
  if ('error' in guard) return guard.error
  const { id } = await props.params
  try {
    await deleteProject(id, guard.user.id)
    return Response.json({ success: true })
  } catch (err) {
    if (err instanceof HttpError) return apiError(err.kind, err.message)
    return apiServerError(err, 'projects/[id] DELETE')
  }
}
