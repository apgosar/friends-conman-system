import crypto from 'crypto'
import { route } from '@/lib/route'
import { prisma } from '@/lib/db'
import { fail } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { uploadFile, deleteFile } from '@/lib/storage'
import { keyFromFileUrl } from '@/lib/storage/files'
import { FloorPlanError, validateFloorPlan } from '@/lib/floor-plan'

/** Best effort: a file that cannot be removed is logged, not an error for the person. */
async function removeStored(url: string | null) {
  const key = url ? keyFromFileUrl(url) : null
  if (!key) return
  try { await deleteFile(key) } catch (err) { logger.warn({ err, key }, 'Could not delete a stored letterhead') }
}

// POST /api/companies/[id]/letterhead (multipart `file`): the A4 image quotations are printed on
export const POST = route<{ id: string }>('admin', async ({ req, params, user }) => {
  const company = await prisma.company.findUnique({ where: { id: params.id }, select: { id: true, letterheadUrl: true } })
  if (!company) throw fail('notFound', 'Company not found')

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) throw fail('invalid', 'Choose the letterhead image')
  const buffer = Buffer.from(await file.arrayBuffer())
  let image: { ext: string; mime: string }
  try { image = validateFloorPlan(buffer, 'Letterhead') } catch (err) {
    if (err instanceof FloorPlanError) throw fail('invalid', err.message)
    throw err
  }

  const url = await uploadFile({ buffer, mimeType: image.mime, folder: 'letterheads', fileName: `${crypto.randomUUID()}.${image.ext}` })
  await prisma.company.update({ where: { id: company.id }, data: { letterheadUrl: url } })
  await removeStored(company.letterheadUrl) // the one it replaces
  await createAuditLog({ userId: user.id, entityType: 'company', entityId: company.id, action: 'letterhead_uploaded' })
  return Response.json({ success: true, data: { letterheadUrl: url } })
})

// DELETE /api/companies/[id]/letterhead: quotations go back to a plain page
export const DELETE = route<{ id: string }>('admin', async ({ params, user }) => {
  const company = await prisma.company.findUnique({ where: { id: params.id }, select: { id: true, letterheadUrl: true } })
  if (!company) throw fail('notFound', 'Company not found')
  await prisma.company.update({ where: { id: company.id }, data: { letterheadUrl: null } })
  await removeStored(company.letterheadUrl)
  await createAuditLog({ userId: user.id, entityType: 'company', entityId: company.id, action: 'letterhead_removed' })
  return Response.json({ success: true })
})
