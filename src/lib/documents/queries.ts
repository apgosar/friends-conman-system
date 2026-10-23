import { prisma } from '@/lib/db'
import { SCHEDULE_ORDER } from '@/lib/payment-plans'

/** What the document builders (payload.ts) need loaded for a sale. */
export const saleForDocument = {
  project: { include: { company: true, charges: { orderBy: { sequence: 'asc' } } } },
  unit: { include: { floor: { include: { wing: true } } } },
  buyers: true,
  tenant: true,
  paymentSchedules: { orderBy: SCHEDULE_ORDER, include: { milestone: true, payments: true, interestWaivers: true } },
} as const

export const loadSaleForDocument = (saleId: string) => prisma.sale.findUnique({ where: { id: saleId }, include: saleForDocument })
export type SaleForDocument = NonNullable<Awaited<ReturnType<typeof loadSaleForDocument>>>

export const loadPaymentForReceipt = (paymentId: string) =>
  prisma.payment.findUnique({
    where: { id: paymentId },
    include: { schedule: { include: { milestone: true, sale: { include: saleForDocument } } } },
  })
type PaymentWithContext = NonNullable<Awaited<ReturnType<typeof loadPaymentForReceipt>>>
export type ReceiptPayment = Omit<PaymentWithContext, 'schedule'>
export type ReceiptSchedule = NonNullable<PaymentWithContext['schedule']>

export const findActiveTemplate = (projectId: string, type: string) => prisma.template.findFirst({ where: { projectId, type, isActive: true } })
