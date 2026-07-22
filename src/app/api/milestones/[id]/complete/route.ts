import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { dispatchAllPending } from '@/lib/comms-dispatcher'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  
  const { id } = await props.params

  try {
    const body = await req.json()
    const { architectCertificateUrl } = body

    if (!architectCertificateUrl) {
      return Response.json({ error: 'Architect Certificate URL is required' }, { status: 400 })
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

    // Fetch affected sales to generate communications
    const affectedSchedules = await prisma.paymentSchedule.findMany({
      where: { milestoneId: id, status: 'DUE' },
      include: {
        sale: {
          include: {
            buyers: {
              where: { isPrimary: true }
            }
          }
        }
      }
    })

    // Generate Communication Logs
    if (affectedSchedules.length > 0) {
      const commLogs: any[] = []
      
      affectedSchedules.forEach(schedule => {
        const primaryBuyer = schedule.sale.buyers[0]
        const amount = Number(schedule.principalAmount) + Number(schedule.gstAmount)
        const isTaxOrParking = schedule.description.toLowerCase().includes('stamp duty') || schedule.description.toLowerCase().includes('registration') || schedule.description.toLowerCase().includes('parking')
        
        let content = ''
        if (isTaxOrParking) {
           content = `Dear ${primaryBuyer?.fullName || 'Customer'},\nPayment for '${schedule.description}' is now due. Please find the attached Demand Letter for ₹${amount.toLocaleString('en-IN')}.\nDue Date: ${dueDate.toLocaleDateString('en-IN')}.\n\nATTACHMENTS:\nDemand Letter|/api/documents/preview/demand-letter?saleId=${schedule.saleId}&milestoneName=${encodeURIComponent(schedule.description)}`
        } else {
           content = `Dear ${primaryBuyer?.fullName || 'Customer'},\nThe milestone '${milestone.name}' is now complete. Please find the attached Demand Letter for ₹${amount.toLocaleString('en-IN')} and the Architect Completion Certificate.\nDue Date: ${dueDate.toLocaleDateString('en-IN')}.\n\nATTACHMENTS:\nArchitect Certificate|${architectCertificateUrl}\nDemand Letter|/api/documents/preview/demand-letter?saleId=${schedule.saleId}&milestoneName=${encodeURIComponent(milestone.name)}`
        }
        
        // Email Log
        commLogs.push({
          saleId: schedule.saleId,
          buyerId: primaryBuyer?.id,
          channel: 'EMAIL',
          type: 'DEMAND_LETTER',
          messageContent: content,
          status: 'PENDING',
          sentAt: new Date(),
          deliveredAt: new Date()
        })

        // WhatsApp Log
        commLogs.push({
          saleId: schedule.saleId,
          buyerId: primaryBuyer?.id,
          channel: 'WHATSAPP',
          type: 'DEMAND_LETTER',
          messageContent: content,
          status: 'PENDING',
          sentAt: new Date(),
          deliveredAt: new Date()
        })
      })
      
      await prisma.communicationLog.createMany({
        data: commLogs
      })

      // Dispatch immediately — sends real emails and WhatsApp messages
      await dispatchAllPending()
    }
    
    return Response.json({ success: true, data: milestone })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
