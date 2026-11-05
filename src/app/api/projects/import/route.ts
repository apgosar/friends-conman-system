import { route } from '@/lib/route'
import { z } from '@/lib/validate'
import { MAX_CHUNKS } from '@/lib/project-transfer/constants'
import { readPackage } from '@/lib/project-transfer/package'
import { importProject, previewImport, readBundle } from '@/lib/project-transfer/import'
import { clearStaged, isUploadId, stagedChunks } from '@/lib/project-transfer/staging'

const upload = z.object({
  uploadId: z.string().refine(isUploadId, 'That upload is not valid'),
  chunks: z.number().int().min(1).max(MAX_CHUNKS),
})
const importBody = upload.extend({
  passphrase: z.string().min(1, 'Enter the passphrase').max(200),
  /** false: only read the file and say what is in it; true: import it */
  confirm: z.boolean(),
})

// POST /api/projects/import  { uploadId, chunks, passphrase, confirm }: Super Admin only.
//   confirm false: opens the uploaded file and answers with what is in it and whether it can be imported here. Nothing is saved.
//   confirm true:  imports it, all or nothing, and removes the uploaded pieces.
export const POST = route('superadmin', async ({ user, body }) => {
  const input = await body(importBody)
  const records = readPackage(stagedChunks(user.id, input.uploadId, input.chunks), input.passphrase)
  try {
    const parsed = await readBundle(records)
    if (!input.confirm) return Response.json({ success: true, preview: await previewImport(parsed) })
    const result = await importProject(parsed, records, user.id)
    await clearStaged(user.id, input.uploadId, input.chunks)
    return Response.json({ success: true, result }, { status: 201 })
  } finally {
    await records.return(undefined)
  }
})

// DELETE /api/projects/import  { uploadId, chunks }: throws away an uploaded file that will not be imported.
export const DELETE = route('superadmin', async ({ user, body }) => {
  const input = await body(upload)
  await clearStaged(user.id, input.uploadId, input.chunks)
  return Response.json({ success: true })
})
