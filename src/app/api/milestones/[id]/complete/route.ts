import { apiError, apiServerError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/guard'
import { syncSaleLifecycle } from '@/lib/sale-lifecycle'
import { dispatchAllPending } from '@/lib/comms-dispatcher'
import { buildCommContent, sanitizeInline } from '@/lib/comms-content'
import type { Prisma } from '@prisma/client'
import { formatDate, formatRupees } from '@/lib/format'

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
    dueDate.setDate(dueDate.getDate() + 14) // 14 days later

    const milestone = await prisma.constructionMilestone.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        actualDate: actualDate,
        architectCertificateUrl: architectCertificateUrl
      }
    })
    
    // Trigger Demands: shift PaymentSchedules from UPCOMING to DUE for this milestone
    await prisma.paymentSchedule.updateMany({
      where: { 
        milestoneId: id,
        status: 'UPCOMING'
      },
      data: {
        status: 'DUE',
        demandGeneratedDate: actualDate,
        dueDate: dueDate
      }
    })

    const affectedSchedules = await prisma.paymentSchedule.findMany({
      where: { milestoneId: id, status: 'DUE' },
      include: {
        sale: {
          include: {
            buyers: {
              where: { receiveComms: true }
            }
          }
        }
      }
    })

    // Demands were just raised, so refresh the lifecycle of every affected sale
    for (const saleId of new Set(affectedSchedules.map((s) => s.saleId))) await syncSaleLifecycle(saleId)

    // Generate Communication Logs
    if (affectedSchedules.length > 0) {
      const commLogs: Prisma.CommunicationLogCreateManyInput[] = []
      const dueText = sanitizeInline(formatDate(dueDate))

      affectedSchedules.forEach(schedule => {
        const amount = Number(schedule.principalAmount) + Number(schedule.gstAmount)
        const isTaxOrParking = schedule.description.toLowerCase().includes('stamp duty') || schedule.description.toLowerCase().includes('registration') || schedule.description.toLowerCase().includes('parking')

        schedule.sale.buyers.forEach(buyer => {
          const greeting = `Dear ${sanitizeInline(buyer.fullName) || 'Customer'},`
          const letter = { label: 'Demand Letter', path: `/api/documents/preview/demand-letter?saleId=${schedule.saleId}&milestoneName=${encodeURIComponent(isTaxOrParking ? schedule.description : milestone.name)}` }
          const { messageContent, attachments } = isTaxOrParking
            ? buildCommContent(`${greeting}\nPayment for '${sanitizeInline(schedule.description)}' is now due. Please find the attached Demand Letter for ${formatRupees(amount)}.\nDue Date: ${dueText}.`, [letter])
            : buildCommContent(`${greeting}\nThe milestone '${sanitizeInline(milestone.name)}' is now complete. Please find the attached Demand Letter for ${formatRupees(amount)} and the Architect Completion Certificate.\nDue Date: ${dueText}.`, [{ label: 'Architect Certificate', path: architectCertificateUrl }, letter])

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
