import { runDailyInterestAndStatus } from '@/lib/scheduler'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await runDailyInterestAndStatus()
    return Response.json({ success: true, message: 'Daily job complete' })
  } catch (err) {
    console.error('Daily cron error:', err)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
