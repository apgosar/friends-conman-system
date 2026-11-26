import { fail, route } from '@/lib/route'
import { previewSternReminder } from '@/lib/stern-reminder'

export const GET = route('admin', async ({ req }) => {
  const scheduleId = req.nextUrl.searchParams.get('scheduleId')
  if (!scheduleId) throw fail('invalid', 'Choose a payment schedule')
  return Response.json({ success: true, data: await previewSternReminder(scheduleId) })
})
