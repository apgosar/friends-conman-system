import type { Prisma } from '@prisma/client'
import { route } from '@/lib/route'
import { transaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { DEMAND_DUE_DAYS } from '@/lib/payment-plans'
import { syncSaleLifecycle } from '@/lib/sale-lifecycle'
import { dispatchAllPending } from '@/lib/comms-dispatcher'
import { buildCommContent, sanitizeInline } from '@/lib/comms-content'
import { formatDate, formatRupees } from '@/lib/format'

// POST /api/schedules/[id]/raise-demand: demand a payment that has no milestone to trigger it (stamp duty and registration).
// It falls due DEMAND_DUE_DAYS later and a demand letter goes to every buyer who is contacted.
export const POST = route<{ id: string }>('admin', async ({ params }) => {
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + DEMAND_DUE_DAYS)

  await transaction(async (tx) => {
    const schedule = await tx.paymentSchedule.findUnique({
      where: { id: params.id },
      include: { sale: { select: { id: true, status: true, buyers: { where: { receiveComms: true }, orderBy: { sequence: 'asc' } } } } },
    })
    if (!schedule) throw fail('notFound', 'Payment not found')
    if (schedule.milestoneId) throw fail('invalid', 'This demand is raised when its construction milestone is completed')
    if (schedule.status !== 'UPCOMING') throw fail('conflict', 'This demand has already been raised')
    if (schedule.sale.status === 'CANCELLED') throw fail('conflict', 'This sale is cancelled')

    await tx.paymentSchedule.update({ where: { id: schedule.id }, data: { status: 'DUE', demandGeneratedDate: new Date(), dueDate } })

    const amount = Number(schedule.principalAmount) + Number(schedule.gstAmount)
    const description = sanitizeInline(schedule.description)
    const dueText = sanitizeInline(formatDate(dueDate))
    const logs: Prisma.CommunicationLogCreateManyInput[] = []
    for (const buyer of schedule.sale.buyers) {
      const { messageContent, attachments } = buildCommContent(
        `Dear ${sanitizeInline(buyer.fullName) || 'Customer'},\nPayment for '${description}' is now due. Please find the attached Demand Letter for ${formatRupees(amount)}.\nDue Date: ${dueText}.`,
        [{ label: 'Demand Letter', path: `/api/documents/preview/demand-letter?saleId=${schedule.saleId}&milestoneName=${encodeURIComponent(schedule.description)}` }],
      )
      for (const [channel, address] of [['EMAIL', buyer.email], ['WHATSAPP', buyer.whatsappNumber]] as const) {
        if (address) logs.push({ saleId: schedule.saleId, buyerId: buyer.id, channel, type: 'DEMAND_LETTER', messageContent, attachments, status: 'PENDING' })
      }
    }
    if (logs.length > 0) await tx.communicationLog.createMany({ data: logs })

    await syncSaleLifecycle(schedule.saleId, tx)

  })

  await dispatchAllPending() // sends the emails and WhatsApp messages now
  return Response.json({ success: true })
})
