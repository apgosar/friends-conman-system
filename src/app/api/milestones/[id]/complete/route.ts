import { apiError, apiServerError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/guard'
import { syncSaleLifecycle } from '@/lib/sale-lifecycle'
import { dispatchAllPending } from '@/lib/comms-dispatcher'
import { buildCommContent, sanitizeInline } from '@/lib/comms-content'
import type { Prisma } from '@prisma/client'
import { formatDate, formatRupees } from '@/lib/format'
import { DEMAND_DUE_DAYS, isStandaloneCharge } from '@/lib/payment-plans'
import { fromPaise, sumRupees, toPaise } from '@/lib/money'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  
  const { id } = await props.params

  try {
    const body = await req.json()
    const { architectCertificateUrl } = body

    if (!architectCertificateUrl) {
      return apiError('invalid', 'Architect Certificate URL is required')
    }

    const actualDate = new Date()
    const dueDate = new Date(actualDate)
    dueDate.setDate(dueDate.getDate() + DEMAND_DUE_DAYS)

    const milestone = await prisma.constructionMilestone.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        actualDate: actualDate,
        architectCertificateUrl: architectCertificateUrl
      }
    })
    
    // Raise this milestone's demands: every one not raised yet. One paid in part in advance (it stayed Upcoming, see
    // statusAfterPayment) is raised too, as Partially Paid, and only its balance is billed; one paid in full in advance
    // stays Paid and gets no letter. Demands already raised are left alone, so completing twice sends nothing twice.
    const toRaise = await prisma.paymentSchedule.findMany({
      where: { milestoneId: id, demandGeneratedDate: null },
      include: {
        payments: { where: { deletedAt: null }, select: { amount: true, gstPaid: true } },
        sale: { select: { deletedAt: true, status: true, buyers: { where: { receiveComms: true } } } },
      },
    })
    const affectedSchedules = toRaise.map((schedule) => {
      const paid = sumRupees(schedule.payments.flatMap((p) => [Number(p.amount), Number(p.gstPaid)]))
      const balance = fromPaise(Math.max(0, toPaise(sumRupees([Number(schedule.principalAmount), Number(schedule.gstAmount)])) - toPaise(paid)))
      const status = schedule.status === 'PAID' || balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'DUE'
      return { ...schedule, paid, balance, status }
    })
    for (const s of affectedSchedules) {
      await prisma.paymentSchedule.update({ where: { id: s.id }, data: { status: s.status, demandGeneratedDate: actualDate, dueDate } })
    }

    // Demands were just raised, so refresh the lifecycle of every affected sale
    for (const saleId of new Set(affectedSchedules.map((s) => s.saleId))) await syncSaleLifecycle(saleId)

    // Demand letters for what is still to pay, on sales that are not cancelled
    const toBill = affectedSchedules.filter((s) => s.balance > 0 && !s.sale.deletedAt && s.sale.status !== 'CANCELLED')
    if (toBill.length > 0) {
      const commLogs: Prisma.CommunicationLogCreateManyInput[] = []
      const dueText = sanitizeInline(formatDate(dueDate))

      toBill.forEach(schedule => {
        const amount = schedule.balance
        const advance = schedule.paid > 0 ? ` (the balance after the advance of ${formatRupees(schedule.paid)} already received)` : ''
        const isTaxOrParking = isStandaloneCharge(schedule.description)

        schedule.sale.buyers.forEach(buyer => {
          const greeting = `Dear ${sanitizeInline(buyer.fullName) || 'Customer'},`
          const letter = { label: 'Demand Letter', path: `/api/documents/preview/demand-letter?saleId=${schedule.saleId}&milestoneName=${encodeURIComponent(isTaxOrParking ? schedule.description : milestone.name)}` }
          const { messageContent, attachments } = isTaxOrParking
            ? buildCommContent(`${greeting}\nPayment for '${sanitizeInline(schedule.description)}' is now due. Please find the attached Demand Letter for ${formatRupees(amount)}${advance}.\nDue Date: ${dueText}.`, [letter])
            : buildCommContent(`${greeting}\nThe milestone '${sanitizeInline(milestone.name)}' is now complete. Please find the attached Demand Letter for ${formatRupees(amount)}${advance} and the Architect Completion Certificate.\nDue Date: ${dueText}.`, [{ label: 'Architect Certificate', path: architectCertificateUrl }, letter])

          for (const [channel, address] of [['EMAIL', buyer.email], ['WHATSAPP', buyer.whatsappNumber]] as const) {
            if (!address) continue
            commLogs.push({ saleId: schedule.saleId, buyerId: buyer.id, channel, type: 'DEMAND_LETTER', messageContent, attachments, status: 'PENDING' })
          }
        })
      })

      await prisma.communicationLog.createMany({
        data: commLogs
      })

      // Dispatch immediately — sends real emails and WhatsApp messages
      await dispatchAllPending()
    }
    
    return Response.json({ success: true, data: milestone })
  } catch (err) {
    return apiServerError(err, 'milestones/[id]/complete')
  }
}
