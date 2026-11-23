import { apiError, apiServerError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/guard'
import { dispatchAllPending } from '@/lib/comms-dispatcher'
import { sanitizeInline } from '@/lib/comms-content'
import { formatRupees } from '@/lib/format'
import { DEMAND_DUE_DAYS, dueDateAfter, isStandaloneCharge } from '@/lib/payment-plans'
import { dueNotice, raiseDemands } from '@/lib/demand-raising'

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

    const milestone = await prisma.constructionMilestone.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        actualDate: actualDate,
        architectCertificateUrl: architectCertificateUrl
      }
    })

    // Raise this milestone's demands (see lib/demand-raising.ts): they fall due the project's number of days after today. Demands
    // already raised are left alone, so completing twice sends nothing twice.
    const { messages } = await raiseDemands(
      { milestoneId: id },
      {
        raisedOn: actualDate,
        dueDateFor: ({ demandDueDays }) => dueDateAfter(actualDate, demandDueDays ?? DEMAND_DUE_DAYS),
        compose: (s, { advance, dueText, amount }) => isStandaloneCharge(s.description)
          ? { text: dueNotice({ description: s.description, amount, advance, dueText }), extra: [], letterFor: s.description }
          : {
              text: `The milestone '${sanitizeInline(milestone.name)}' is now complete. Please find the attached Demand Letter for ${formatRupees(amount)}${advance} and the Architect Completion Certificate.
Due Date: ${dueText}.`,
              extra: [{ label: 'Architect Certificate', path: architectCertificateUrl }],
              letterFor: milestone.name,
            },
      },
    )

    // Dispatch immediately — sends real emails and WhatsApp messages
    if (messages > 0) await dispatchAllPending()

    return Response.json({ success: true, data: milestone })
  } catch (err) {
    return apiServerError(err, 'milestones/[id]/complete')
  }
}
