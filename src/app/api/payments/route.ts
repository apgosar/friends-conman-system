import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { generateReceiptNumber } from '@/lib/receipt-number'
import { parseBody, z } from '@/lib/validate'
import { commsRateLimit, rateLimitExceeded } from '@/lib/rate-limit'
import { syncSaleLifecycle } from '@/lib/sale-lifecycle'
import { OVERDUE_SCHEDULE_STATUSES } from '@/lib/status'

// ---------------------------------------------------------------------------
// Zod schema — validates exactly what fields are expected for a payment
// ---------------------------------------------------------------------------
const PaymentSchema = z.object({
  scheduleId: z.string().min(1, 'scheduleId is required'),
  saleId: z.string().min(1, 'saleId is required'),
  amount: z.number().min(0, 'amount cannot be negative'),
  gstPaid: z.number().min(0).optional().default(0),
  mode: z.enum(['CHEQUE', 'NEFT', 'RTGS', 'IMPS', 'UPI', 'CASH', 'DD', 'OTHER']),
  referenceNumber: z.string().max(100).optional(),
  bankName: z.string().max(100).optional(),
  remark: z.string().max(500).optional(),
  paymentDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid paymentDate' }),
}).refine((v) => v.amount + v.gstPaid > 0, { message: 'Enter a principal and/or GST amount greater than zero' })

const round2 = (n: number) => Math.round(n * 100) / 100

class PaymentInputError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

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
      // 0. Validate against what is still outstanding on this demand
      const existing = await tx.paymentSchedule.findFirst({
        where: { id: scheduleId, saleId },
        include: { payments: { where: { deletedAt: null } } },
      })
      if (!existing) throw new PaymentInputError('Payment schedule not found for this sale', 404)
      const principalOutstanding = round2(existing.principalAmount - existing.payments.reduce((a, p) => a + p.amount, 0))
      const gstOutstanding = round2(existing.gstAmount - existing.payments.reduce((a, p) => a + p.gstPaid, 0))
      if (amount > principalOutstanding + 0.005) {
        throw new PaymentInputError(`Principal exceeds outstanding amount (${principalOutstanding})`, 400)
      }
      if ((gstPaid ?? 0) > gstOutstanding + 0.005) {
        throw new PaymentInputError(`GST exceeds outstanding amount (${gstOutstanding})`, 400)
      }

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
      
      // 2. Mark the Schedule PAID only once both principal and GST are fully received
      const fullyPaid =
        round2(principalOutstanding - amount) <= 0.005 && round2(gstOutstanding - (gstPaid ?? 0)) <= 0.005
      await tx.paymentSchedule.update({
        where: { id: scheduleId },
        // A part-payment must not hide that the demand is overdue, so keep the overdue bucket
        data: { status: fullyPaid ? 'PAID' : OVERDUE_SCHEDULE_STATUSES.includes(existing.status) ? existing.status : 'PARTIALLY_PAID' }
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
    
    await syncSaleLifecycle(saleId)
    return Response.json({ success: true, data: payment }, { status: 201 })
  } catch (err) {
    if (err instanceof PaymentInputError) return Response.json({ error: err.message }, { status: err.status })
    console.error('[payments POST]', err)
    return Response.json({ error: 'Payment creation failed' }, { status: 500 })
  }
}
