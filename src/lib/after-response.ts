import { after } from 'next/server'
import { logger } from '@/lib/logger'

/**
 * Run work after the answer has been sent (Next's `after`), such as sending the messages a request queued. Outside a request
 * (a script or a test) it simply starts the work. A failure is logged, never thrown: what the request saved stays saved, and
 * queued messages are picked up by the next dispatch.
 */
export function afterResponse(label: string, work: () => Promise<unknown>) {
  const run = async () => {
    try { await work() } catch (err) { logger.error({ err }, label) }
  }
  try {
    after(run)
  } catch {
    void run()
  }
}
