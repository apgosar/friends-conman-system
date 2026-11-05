import { route } from '@/lib/route'
import { z } from '@/lib/validate'
import { fail } from '@/lib/errors'
import { MAX_CHUNKS } from '@/lib/project-transfer/constants'
import { MAX_CHUNK_BYTES, isUploadId, stageChunk } from '@/lib/project-transfer/staging'

const query = z.object({
  uploadId: z.string().refine(isUploadId),
  index: z.coerce.number().int().min(0).max(MAX_CHUNKS - 1),
})

// POST /api/projects/import/chunk?uploadId=…&index=…  (the raw bytes of one piece of the file): Super Admin only.
// A project file can be larger than one request may be, so the screen sends it in pieces; /api/projects/import then reads them back.
export const POST = route('superadmin', async ({ req, user }) => {
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) throw fail('invalid', 'That upload is not valid')
  const bytes = Buffer.from(await req.arrayBuffer())
  if (bytes.length === 0 || bytes.length > MAX_CHUNK_BYTES) throw fail('invalid', 'That piece of the upload is not valid')
  await stageChunk(user.id, parsed.data.uploadId, parsed.data.index, bytes)
  return Response.json({ success: true })
})
