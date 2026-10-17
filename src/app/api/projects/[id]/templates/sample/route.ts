import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/guard'
import { TEMPLATE_TYPE_VALUES, DOCX_MIME } from '@/lib/template-constants'
import { buildSampleDocx } from '@/lib/template-sample'

// GET /api/projects/[id]/templates/sample?type=DEMAND_LETTER — a starter .docx with the right tags for that type
export async function GET(req: NextRequest) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const session = { user: guard.user }

  const type = new URL(req.url).searchParams.get('type') ?? 'DEMAND_LETTER'
  if (!TEMPLATE_TYPE_VALUES.includes(type)) return NextResponse.json({ error: 'Unknown document type' }, { status: 400 })

  const buf = await buildSampleDocx(type)
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': DOCX_MIME,
      'Content-Disposition': `attachment; filename="sample-${type.toLowerCase().replace(/_/g, '-')}-template.docx"`,
    },
  })
}
