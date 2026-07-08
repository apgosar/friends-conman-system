import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        unit: true,
        documents: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })
    
    if (!sale) return NextResponse.json({ success: false, error: 'Sale not found' }, { status: 404 })
    
    return NextResponse.json({ success: true, data: sale })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Only Super Admins can delete sales' }, { status: 403 })
  }

  const { id } = await props.params
  try {
    await prisma.$transaction(async (tx) => {
      // 0. Get sale to know which unit to release
      const sale = await tx.sale.findUnique({ where: { id }, select: { unitId: true } })

      // 1. Delete payments (child of paymentSchedule)
      await tx.payment.deleteMany({ where: { saleId: id } })

      // 2. Delete payment schedules
      await tx.paymentSchedule.deleteMany({ where: { saleId: id } })

      // 3. Delete KYC documents (child of buyer)
      const buyers = await tx.buyer.findMany({ where: { saleId: id }, select: { id: true } })
      const buyerIds = buyers.map(b => b.id)
      if (buyerIds.length > 0) {
        await tx.kycDocument.deleteMany({ where: { buyerId: { in: buyerIds } } })
      }

      // 4. Delete buyers
      await tx.buyer.deleteMany({ where: { saleId: id } })

      // 5. Delete documents
      await tx.document.deleteMany({ where: { saleId: id } })

      // 6. Delete communication logs
      await tx.communicationLog.deleteMany({ where: { saleId: id } })

      // 7. Delete loan disbursements and loans
      const loans = await tx.loan.findMany({ where: { saleId: id }, select: { id: true } })
      const loanIds = loans.map(l => l.id)
      if (loanIds.length > 0) {
        await tx.loanDisbursement.deleteMany({ where: { loanId: { in: loanIds } } })
        await tx.loan.deleteMany({ where: { saleId: id } })
      }

      // 8. Delete audit logs referencing this sale
      await tx.auditLog.deleteMany({ where: { entityId: id, entityType: 'sale' } })

      // 9. Finally delete the sale itself
      await tx.sale.delete({ where: { id } })

      // 10. Release the unit
      if (sale?.unitId) {
        await tx.unit.update({
          where: { id: sale.unitId },
          data: { status: 'AVAILABLE' }
        })
      }
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

