import { it, expect, beforeEach, vi } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'

const deleteFile = vi.fn(async () => undefined)
vi.mock('@/lib/storage', async (orig) => ({ ...(await orig<typeof import('@/lib/storage')>()), deleteFile: (...a: unknown[]) => (deleteFile as unknown as (...x: unknown[]) => Promise<void>)(...a) }))

describeDb('deleting a project', () => {
  beforeEach(async () => { await resetDb(); deleteFile.mockClear() })

  it('removes a project that was never sold in, with its building, charges and milestones, and keeps the company', async () => {
    const { deleteProject } = await import('@/lib/projects/delete-project')
    const prisma = await getPrisma()
    const user = await seedUser('SUPER_ADMIN')
    const { project } = await seedProject({ units: 2 })
    await prisma.projectCharge.create({ data: { projectId: project.id, name: 'Legal', amountType: 'FIXED', amount: 15000, appliesTo: 'BOTH' } })
    await prisma.constructionMilestone.create({ data: { projectId: project.id, name: 'Plinth', sequence: 1 } })

    await expect(deleteProject(project.id, user.id)).resolves.toMatchObject({ sales: 0, payments: 0 })

    expect(await prisma.project.count({ where: { id: project.id } })).toBe(0)
    expect(await prisma.wing.count()).toBe(0)
    expect(await prisma.unit.count()).toBe(0)
    expect(await prisma.projectCharge.count()).toBe(0)
    expect(await prisma.constructionMilestone.count()).toBe(0)
    expect(await prisma.company.count()).toBe(1) // the company is not the project's
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityType: 'project', entityId: project.id, action: 'deleted' } })
    expect(audit.userId).toBe(user.id)
  })

  it('deletes the sales too, with their buyers, schedules, payments, TDS records, documents and messages, but only this project\'s', async () => {
    const { deleteProject } = await import('@/lib/projects/delete-project')
    const prisma = await getPrisma()
    const user = await seedUser('SUPER_ADMIN')
    const mine = await seedProject({ name: 'Test project', units: 2 })
    const other = await seedProject({ name: 'Real project', units: 1 })

    const sell = async (projectId: string, unitId: string, number: string) => {
      const sale = await prisma.sale.create({ data: { saleNumber: number, projectId, unitId, agreementValue: 1000, gstAmount: 0, bookingDate: new Date(), status: 'BOOKED' } })
      const buyer = await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Asha', isPrimary: true } })
      const schedule = await prisma.paymentSchedule.create({ data: { saleId: sale.id, description: 'Booking', principalAmount: 1000, gstAmount: 0, status: 'PAID' } })
      const payment = await prisma.payment.create({ data: { scheduleId: schedule.id, saleId: sale.id, amount: 1000, mode: 'NEFT', paymentDate: new Date(), receiptNumber: `RCP-${number}` } })
      await prisma.tdsRecord.create({ data: { paymentId: payment.id, saleId: sale.id, tdsAmount: 10 } })
      await prisma.communicationLog.create({ data: { saleId: sale.id, buyerId: buyer.id, channel: 'EMAIL', type: 'RECEIPT', messageContent: 'x', status: 'SENT' } })
      await prisma.document.create({ data: { saleId: sale.id, type: 'SALE_AGREEMENT', status: 'GENERATED', pdfUrl: `/api/files/documents%2F${number}.docx` } })
      return sale
    }
    await sell(mine.project.id, mine.units[0].id, 'T-1')
    await sell(mine.project.id, mine.units[1].id, 'T-2')
    const kept = await sell(other.project.id, other.units[0].id, 'R-1')
    await prisma.sale.update({ where: { saleNumber: 'T-2' }, data: { status: 'CANCELLED', deletedAt: new Date() } }) // a cancelled sale goes too

    await expect(deleteProject(mine.project.id, user.id)).resolves.toMatchObject({ sales: 2, payments: 2 })

    expect(await prisma.project.count({ where: { id: mine.project.id } })).toBe(0)
    expect(await prisma.sale.findMany({ select: { id: true } })).toEqual([{ id: kept.id }]) // the other project's sale stays
    expect(await prisma.payment.count()).toBe(1)
    expect(await prisma.paymentSchedule.count()).toBe(1)
    expect(await prisma.buyer.count()).toBe(1)
    expect(await prisma.communicationLog.count()).toBe(1)
    expect(await prisma.document.count()).toBe(1)
    expect(await prisma.project.count({ where: { id: other.project.id } })).toBe(1)
    expect(await prisma.unit.count()).toBe(1)
    expect(deleteFile).toHaveBeenCalledWith('documents/T-1.docx') // the stored agreements go too
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityType: 'project', entityId: mine.project.id, action: 'deleted' } })
    expect(audit.oldValues).toMatchObject({ name: 'Test project', sales: 2, payments: 2 })
  })

  it('says so when the project does not exist', async () => {
    const { deleteProject } = await import('@/lib/projects/delete-project')
    await expect(deleteProject('nope', 'u')).rejects.toMatchObject({ kind: 'notFound' })
  })
})
