import { prisma, transaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { createAuditLog } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { deleteFile } from '@/lib/storage'
import { QUOTE_FOLDER, keyFromFileUrl } from '@/lib/storage/files'

export interface DeletedProject { sales: number; payments: number; files: number }

/**
 * Delete a project for good, for a Super Admin (a test project, or one set up by mistake). Everything under it goes: its
 * building (wings, floors, units), unit types, milestones, payment plans, other charges, templates, tenants and quotes,
 * and every sale with its buyers, payment schedule, interest, payments, receipts, documents, loans and messages.
 *
 * This is the one place financial records are really deleted, so it is Super Admin only (the route checks) and audited
 * with the counts. Stored files (agreements, templates, quote PDFs, floor plans) are removed afterwards on a best-effort basis.
 */
export async function deleteProject(projectId: string, actorId: string): Promise<DeletedProject> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, city: true, type: true } })
  if (!project) throw fail('notFound', 'Project not found')

  const sales = await prisma.sale.findMany({ where: { projectId }, select: { id: true } }) // including cancelled and deleted ones
  const saleIds = sales.map((s) => s.id)

  // The files to remove once the records are gone
  const [documents, templates, unitTypes, inquiries] = await Promise.all([
    prisma.document.findMany({ where: { saleId: { in: saleIds } }, select: { pdfUrl: true } }),
    prisma.template.findMany({ where: { projectId }, select: { fileUrl: true } }),
    prisma.unitType.findMany({ where: { projectId }, select: { floorPlanUrl: true } }),
    prisma.inquiry.findMany({ where: { unit: { floor: { wing: { projectId } } } }, select: { id: true } }),
  ])
  const keys = [
    ...[...documents.map((d) => d.pdfUrl), ...templates.map((t) => t.fileUrl), ...unitTypes.map((u) => u.floorPlanUrl)].map((url) => (url ? keyFromFileUrl(url) : null)),
    ...inquiries.map((q) => `${QUOTE_FOLDER}/${q.id}.pdf`),
  ].filter((k): k is string => !!k)

  const payments = await transaction(async (tx) => {
    // Payments and TDS records are protected from being deleted along with a demand, so they go first
    await tx.tdsRecord.deleteMany({ where: { payment: { saleId: { in: saleIds } } } })
    const removed = await tx.payment.deleteMany({ where: { saleId: { in: saleIds } } })
    await tx.sale.deleteMany({ where: { id: { in: saleIds } } }) // schedules, interest, buyers, documents, loans and messages go with them
    // A payment plan line points at a milestone and blocks it from being deleted, so the lines go before the milestones do
    await tx.paymentPlanItem.deleteMany({ where: { plan: { projectId } } })
    await tx.project.delete({ where: { id: projectId } }) // the building, plans, charges, templates, tenants and quotes go with it
    return removed.count
  }, { timeout: 60_000, maxWait: 10_000 })

  await createAuditLog({
    userId: actorId, entityType: 'project', entityId: projectId, action: 'deleted',
    oldValues: { name: project.name, city: project.city, type: project.type, sales: saleIds.length, payments },
  })

  let files = 0
  for (const key of keys) {
    try { await deleteFile(key); files++ } catch (err) { logger.warn({ err, key }, 'Could not delete a stored file of a deleted project') }
  }
  return { sales: saleIds.length, payments, files }
}
