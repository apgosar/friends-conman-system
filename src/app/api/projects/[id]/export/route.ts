import { route } from '@/lib/route'
import { z } from '@/lib/validate'
import { createAuditLog } from '@/lib/audit'
import { exportProject } from '@/lib/project-transfer/export'
import { MIN_PASSPHRASE_LENGTH } from '@/lib/project-transfer/constants'

const schema = z.object({
  passphrase: z.string().min(MIN_PASSPHRASE_LENGTH, `Use at least ${MIN_PASSPHRASE_LENGTH} characters for the passphrase`).max(200, 'The passphrase is too long'),
})

// POST /api/projects/[id]/export  { passphrase }: Super Admin only.
// Answers with the whole project (building, sales, buyers with their PAN and Aadhaar, payments, documents and the stored
// files) as one file encrypted with the passphrase, to be imported on another server. The passphrase is in the body, never in the URL.
export const POST = route<{ id: string }>('superadmin', async ({ params, user, body }) => {
  const { passphrase } = await body(schema)
  const { stream, filename, name } = await exportProject(params.id, passphrase)
  await createAuditLog({ userId: user.id, projectId: params.id, entityType: 'project', entityId: params.id, action: 'exported', newValues: { name } })
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
})
