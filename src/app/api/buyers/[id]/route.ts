import { route } from '@/lib/route'
import { transaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { isAnonymized } from '@/lib/dpdp-compliance'
import { BuyerEditSchema } from '@/lib/buyers'
import { normalizePhone } from '@/lib/phone'

// PUT /api/buyers/[id]: change a buyer's details. A blank PAN or Aadhaar keeps the saved one (they are never sent to the screen).
export const PUT = route<{ id: string }>('admin', async ({ params, user, body }) => {
  const input = await body(BuyerEditSchema)
  const whatsapp = normalizePhone(input.whatsappNumber)

  await transaction(async (tx) => {
    const buyer = await tx.buyer.findUnique({ where: { id: params.id }, select: { id: true, fullName: true, isPrimary: true, sale: { select: { projectId: true } } } })
    if (!buyer) throw fail('notFound', 'Buyer not found')
    if (isAnonymized(buyer.fullName)) throw fail('conflict', 'The personal data of this buyer was erased, so it cannot be edited')
    if (buyer.isPrimary && !input.receiveComms) throw fail('invalid', 'Communication cannot be turned off for the primary buyer')

    await tx.buyer.update({
      where: { id: buyer.id },
      data: {
        fullName: input.fullName,
        email: input.email || null,
        whatsappNumber: whatsapp.ok ? whatsapp.value : null,
        address: input.address || null,
        receiveComms: input.receiveComms,
        ...(input.panNumber && { panNumber: input.panNumber }),
        ...(input.aadhaarNumber && { aadhaarNumber: input.aadhaarNumber }),
      },
    })
    // The audit trail says what was touched, not the personal values
    await tx.auditLog.create({
      data: {
        userId: user.id, projectId: buyer.sale.projectId, entityType: 'buyer', entityId: buyer.id, action: 'updated',
        newValues: { panChanged: !!input.panNumber, aadhaarChanged: !!input.aadhaarNumber },
      },
    })
  })

  return Response.json({ success: true })
})
