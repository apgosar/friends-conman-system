import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { dispatchAllPending } from '@/lib/comms-dispatcher'
import { generateSaleNumber } from '@/lib/receipt-number'
import { createAuditLog } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const status = searchParams.get('status')
  const sales = await prisma.sale.findMany({
    where: { ...(projectId ? { projectId } : {}), ...(status ? { status: status as any } : {}) },
    include: {
      project: { select: { name: true } },
      unit: { select: { unitNumber: true, configuration: true } },
      buyers: true, paymentSchedules: true,
      _count: { select: { payments: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return Response.json({ success: true, data: sales })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { projectId, unitId, tenantId, saleType, agreementValue, gstAmount, stampDuty, registrationCharges, carParking, carParkingCharges, parkingPodiumLevel, parkingFloor, parkingNumber, bookingAmount, bookingDate, buyers, paymentSchedules } = body
  if (!projectId || !unitId || !agreementValue || !bookingDate || !buyers?.length) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const computedGst = gstAmount !== undefined ? parseFloat(gstAmount) : parseFloat(agreementValue) * 0.05
  const saleNumber = await generateSaleNumber(projectId)
  const sale = await prisma.$transaction(async (tx) => {
    const newSale = await tx.sale.create({
      data: {
        saleNumber, projectId, unitId, tenantId: tenantId || null,
        saleType: saleType || 'FRESH',
        agreementValue: parseFloat(agreementValue), gstAmount: computedGst,
        stampDuty: stampDuty ? parseFloat(stampDuty) : null,
        registrationCharges: registrationCharges ? parseFloat(registrationCharges) : null,
        carParking: carParking === true || carParking === 'true',
        carParkingCharges: carParkingCharges ? parseFloat(carParkingCharges) : null,
        parkingPodiumLevel: parkingPodiumLevel || null,
        parkingFloor: parkingFloor || null,
        parkingNumber: parkingNumber || null,
        bookingAmount: bookingAmount ? parseFloat(bookingAmount) : null,
        bookingDate: new Date(bookingDate), status: 'BOOKED',
      },
    })
    await tx.buyer.createMany({
      data: buyers.map((b: any, i: number) => ({
        saleId: newSale.id, fullName: b.fullName, email: b.email || null,
        whatsappNumber: b.whatsappNumber || null, panNumber: b.panNumber || null,
        aadhaarNumber: b.aadhaarNumber || null, address: b.address || null,
        isPrimary: i === 0, sequence: i + 1, receiveComms: b.receiveComms !== false,
      })),
    })
    
    // Fetch the primary buyer we just created to attach to comm logs
    const createdPrimaryBuyer = await tx.buyer.findFirst({ where: { saleId: newSale.id, isPrimary: true } })

    if (paymentSchedules?.length) {
      // Fetch milestone statuses to see if they are already completed
      const milestoneIds = paymentSchedules.map((ps: any) => ps.milestoneId).filter(Boolean)
      const completedMilestoneDates = new Map<string, Date | null>()
      
      if (milestoneIds.length > 0) {
        const milestones = await tx.constructionMilestone.findMany({
          where: { id: { in: milestoneIds }, status: 'COMPLETED' },
          select: { id: true, actualDate: true }
        })
        milestones.forEach(m => completedMilestoneDates.set(m.id, m.actualDate))
      }

      const createdSchedules = await tx.paymentSchedule.createManyAndReturn({
        data: paymentSchedules.map((ps: any) => {
          const isCompleted = ps.milestoneId && completedMilestoneDates.has(ps.milestoneId)
          const actualDate = isCompleted ? (completedMilestoneDates.get(ps.milestoneId!) || new Date()) : null
          
          let computedDueDate = ps.dueDate ? new Date(ps.dueDate) : null
          if (isCompleted && actualDate) {
             computedDueDate = new Date(actualDate)
             computedDueDate.setDate(computedDueDate.getDate() + 14)
          }

          return {
            saleId: newSale.id, 
            milestoneId: ps.milestoneId || null,
            description: ps.description, 
            principalAmount: parseFloat(ps.principalAmount),
            gstAmount: ps.gstAmount ? parseFloat(ps.gstAmount) : 0,
            dueDate: computedDueDate, 
            status: isCompleted ? 'DUE' : 'UPCOMING',
            demandGeneratedDate: isCompleted ? new Date() : null,
          }
        }),
      })

      // Generate Communication Logs for already DUE schedules (past milestones)
      const dueSchedules = createdSchedules.filter((s: any) => s.status === 'DUE' && s.milestoneId)
      if (dueSchedules.length > 0) {
        // Fetch the milestone names and architect certificates
        const dueMilestones = await tx.constructionMilestone.findMany({
          where: { id: { in: dueSchedules.map((s: any) => s.milestoneId) } },
          select: { id: true, name: true, architectCertificateUrl: true }
        })
        const milestoneMap = new Map(dueMilestones.map((m: any) => [m.id, m]))
        
        const primaryBuyer = buyers.find((b: any, i: number) => i === 0)
        
        const commLogs: any[] = []
        
        dueSchedules.forEach((schedule: any) => {
          const milestone = milestoneMap.get(schedule.milestoneId!)
          const amount = Number(schedule.principalAmount) + Number(schedule.gstAmount)
          const isTaxOrParking = schedule.description.toLowerCase().includes('stamp duty') || schedule.description.toLowerCase().includes('registration') || schedule.description.toLowerCase().includes('parking')
          
          let content = ''
          if (isTaxOrParking) {
             content = `Dear ${primaryBuyer?.fullName || 'Customer'},\nPayment for '${schedule.description}' is now due. Please find the attached Demand Letter for ₹${amount.toLocaleString('en-IN')}.\nDue Date: ${schedule.dueDate ? new Date(schedule.dueDate).toLocaleDateString('en-IN') : 'N/A'}.\n\nATTACHMENTS:\nDemand Letter|/api/documents/preview/demand-letter?saleId=${newSale.id}&milestoneName=${encodeURIComponent(schedule.description)}`
          } else {
             content = `Dear ${primaryBuyer?.fullName || 'Customer'},\nThe milestone '${milestone?.name}' is now complete. Please find the attached Demand Letter for ₹${amount.toLocaleString('en-IN')} and the Architect Completion Certificate.\nDue Date: ${schedule.dueDate ? new Date(schedule.dueDate).toLocaleDateString('en-IN') : 'N/A'}.\n\nATTACHMENTS:\nArchitect Certificate|${milestone?.architectCertificateUrl || ''}\nDemand Letter|/api/documents/preview/demand-letter?saleId=${newSale.id}&milestoneName=${encodeURIComponent(milestone?.name || '')}`
          }
          
          // Email Log
          commLogs.push({
            saleId: newSale.id,
            buyerId: createdPrimaryBuyer?.id,
            channel: 'EMAIL',
            type: 'DEMAND_LETTER',
            messageContent: content,
            status: 'PENDING',
          })

          // WhatsApp Log
          commLogs.push({
            saleId: newSale.id,
            buyerId: createdPrimaryBuyer?.id,
            channel: 'WHATSAPP',
            type: 'DEMAND_LETTER',
            messageContent: content,
            status: 'PENDING',
          })
        })
        
        await tx.communicationLog.createMany({
          data: commLogs
        })

        // Dispatch immediately after the transaction completes — done outside tx below
      }
    }
    await tx.unit.update({ where: { id: unitId }, data: { status: 'BOOKED' } })
    return newSale
  })
  await createAuditLog({ userId: session.user.id, projectId, entityType: 'sale', entityId: sale.id, action: 'created', newValues: { saleNumber, saleType, agreementValue } })
  // Dispatch pending comm logs (booking demand notifications)
  dispatchAllPending().catch(console.error) // fire-and-forget so it doesn't block the response
  return Response.json({ success: true, data: sale }, { status: 201 })
}
