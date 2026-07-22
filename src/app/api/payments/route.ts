import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { generateReceiptNumber } from '@/lib/receipt-number'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  
  const body = await req.json()
  const { scheduleId, saleId, amount, gstPaid, mode, referenceNumber, remark, bankName, paymentDate } = body

  if (!scheduleId || !saleId || amount === undefined) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    const sale = await prisma.sale.findUnique({ where: { id: saleId } })
    if (!sale) return Response.json({ error: 'Sale not found' }, { status: 404 })

    const receiptNumber = await generateReceiptNumber(sale.projectId)

    const payment = await prisma.$transaction(async (tx) => {
      // 1. Create the Payment
      const newPayment = await tx.payment.create({
        data: {
          scheduleId,
          saleId,
          amount: parseFloat(amount),
          gstPaid: gstPaid ? parseFloat(gstPaid) : 0,
          mode,
          referenceNumber,
          remark,
          bankName,
          paymentDate: new Date(paymentDate || new Date()),
          clearedDate: new Date(paymentDate || new Date()), // Auto-cleared for this mock
          receiptNumber,
        }
      })
      
      // 2. Mark the Schedule as PAID (Assuming it's a full payment for this mock)
      await tx.paymentSchedule.update({
        where: { id: scheduleId },
        data: { status: 'PAID' }
      })
      
      // 3. Generate Communication Logs
      const primaryBuyer = await tx.buyer.findFirst({ where: { saleId, isPrimary: true } }) || await tx.buyer.findFirst({ where: { saleId } })
      const schedule = await tx.paymentSchedule.findUnique({ where: { id: scheduleId } })
      const description = schedule?.description || 'Milestone Payment'
      const totalPaid = parseFloat(amount) + (gstPaid ? parseFloat(gstPaid) : 0)
      
      const content = `Dear ${primaryBuyer?.fullName || 'Customer'},\nThank you for your payment of ₹${totalPaid.toLocaleString('en-IN')} towards ${description}. We have successfully received the amount. Please find your official receipt attached.\n\nMILESTONE: ${description}\n\nATTACHMENTS:\nReceipt|/api/documents/preview/receipt?paymentId=${newPayment.id}`
      
      await tx.communicationLog.createMany({
        data: [
          { saleId, buyerId: primaryBuyer?.id, channel: 'EMAIL', type: 'RECEIPT', messageContent: content, status: 'PENDING', sentAt: new Date() },
          { saleId, buyerId: primaryBuyer?.id, channel: 'WHATSAPP', type: 'RECEIPT', messageContent: content, status: 'PENDING', sentAt: new Date() }
        ]
      })
      
      return newPayment
    })
    
    return Response.json({ success: true, data: payment }, { status: 201 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
