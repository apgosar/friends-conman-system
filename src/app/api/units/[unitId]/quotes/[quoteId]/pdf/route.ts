import { route } from '@/lib/route'
import { prisma } from '@/lib/db'
import { fail } from '@/lib/errors'
import { generateAndSaveQuotePdf } from '@/lib/pdf-generator'
import { downloadFile } from '@/lib/storage'
import { QUOTE_FOLDER, isNotFoundError } from '@/lib/storage/files'

// GET /api/units/[unitId]/quotes/[quoteId]/pdf: the quote as a PDF, opened in the browser. It is the same file that is
// shared with the customer: made when the quote is created or changed, and rebuilt here if the saved copy is missing.
export const GET = route<{ unitId: string; quoteId: string }>('staff', async ({ params }) => {
  const inquiry = await prisma.inquiry.findFirst({ where: { id: params.quoteId, unitId: params.unitId }, select: { id: true, unit: { select: { unitNumber: true } } } })
  if (!inquiry) throw fail('notFound', 'Quote not found')

  const key = `${QUOTE_FOLDER}/${inquiry.id}.pdf`
  let pdf: Buffer
  try {
    pdf = await downloadFile(key)
  } catch (err) {
    if (!isNotFoundError(err)) throw err
    if (!(await generateAndSaveQuotePdf(inquiry.id))) throw fail('server', 'Could not generate the quote PDF')
    pdf = await downloadFile(key)
  }

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Quote_${inquiry.unit.unitNumber.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
})
