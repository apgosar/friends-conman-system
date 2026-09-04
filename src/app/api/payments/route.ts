import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { generateReceiptNumber } from '@/lib/receipt-number'
import { parseBody, z } from '@/lib/validate'
import { commsRateLimit, rateLimitExceeded } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// Zod schema — validates exactly what fields are expected for a payment
// ---------------------------------------------------------------------------
const PaymentSchema = z.object({
  scheduleId: z.string().min(1, 'scheduleId is required'),
  saleId: z.string().min(1, 'saleId is required'),
  amount: z.number().positive('amount must be positive'),
  gstPaid: z.number().min(0).optional().default(0),
  mode: z.enum(['CHEQUE', 'NEFT', 'RTGS', 'IMPS', 'UPI', 'CASH', 'DD', 'OTHER']),
  referenceNumber: z.string().max(100).optional(),
  bankName: z.string().max(100).optional(),
  remark: z.string().max(500).optional(),
  paymentDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid paymentDate' }),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Rate limit communications that will be created with payment
  const rl = await commsRateLimit(req)
  if (!rl.ok) return rateLimitExceeded(rl.reset)

  // Validate body
  const { data, error } = await parseBody(req, PaymentSchema)
  if (error) return error

  const { scheduleId, saleId, amount, gstPaid, mode, referenceNumber, remark, bankName, paymentDate } = data

  try {
    const sale = await prisma.sale.findUnique({ where: { id: saleId, deletedAt: null } })
    if (!sale) return Response.json({ error: 'Sale not found' }, { status: 404 })

    const receiptNumber = await generateReceiptNumber(sale.projectId)

    const payment = await prisma.$transaction(async (tx) => {
      // 1. Create the Payment
      const newPayment = await tx.payment.create({
        data: {
          scheduleId,
          saleId,
          amount,
          gstPaid: gstPaid ?? 0,
          mode,
          referenceNumber,
          remark,
          bankName,
          paymentDate: new Date(paymentDate),
          clearedDate: new Date(paymentDate), // Auto-cleared for this mock
          receiptNumber,
        }
      })
      
      // 2. Mark the Schedule as PAID
      await tx.paymentSchedule.update({
        where: { id: scheduleId },
        data: { status: 'PAID' }
      })
      
      // 3. Generate Communication Logs for receipt
      const primaryBuyer =
        await tx.buyer.findFirst({ where: { saleId, isPrimary: true } }) ??
        await tx.buyer.findFirst({ where: { saleId } })
      const schedule = await tx.paymentSchedule.findUnique({ where: { id: scheduleId } })
      const description = schedule?.description || 'Milestone Payment'
      const totalPaid = amount + (gstPaid ?? 0)
      
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
  } catch (err) {
    console.error('[payments POST]', err)
    return Response.json({ error: 'Payment creation failed' }, { status: 500 })
  }
}
