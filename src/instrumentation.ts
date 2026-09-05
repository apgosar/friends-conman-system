/**
 * Next.js startup hook — register() always runs once in the Node.js runtime
 * (never Edge), so this is the right place to log license status loudly on
 * boot instead of only discovering it's blocked on the first request.
 *
 * This is observability only. The actual enforcement lives in src/proxy.ts,
 * which does its own independent check — proxy.ts may run in a different
 * bundle/runtime than this file, so state isn't shared between the two.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { deploymentConfig } = await import('@/lib/deployment-config')
  if (!deploymentConfig.licenseEnforced) return

  const { getLicenseStatus } = await import('@/lib/license/verify')
  const { logger } = await import('@/lib/logger')

  function currentHostname(): string | undefined {
    try {
      return new URL(process.env.APP_URL || process.env.NEXTAUTH_URL || '').hostname
    } catch {
      return undefined
    }
  }

  async function logStatus() {
    const status = await getLicenseStatus(currentHostname())
    const level = status.state === 'valid' ? 'info' : status.state === 'grace' ? 'warn' : 'error'
    logger[level]({ license: status }, `[License] ${status.message}`)
  }

  await logStatus()
  setInterval(logStatus, 6 * 60 * 60 * 1000)
}
