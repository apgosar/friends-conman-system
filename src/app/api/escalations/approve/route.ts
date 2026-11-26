import { z } from 'zod'
import { route } from '@/lib/route'
import { afterResponse } from '@/lib/after-response'
import { dispatchAllPending } from '@/lib/comms-dispatcher'
import { sendSternReminder } from '@/lib/stern-reminder'

const schema = z.object({ scheduleId: z.string().min(1, 'Choose a payment schedule') })

export const POST = route('admin', async ({ user, body }) => {
  const { scheduleId } = await body(schema)
  const result = await sendSternReminder(scheduleId, user)
  afterResponse('Stern reminder dispatch failed', dispatchAllPending)
  return Response.json({ success: true, data: result })
})
