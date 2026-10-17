import { formatDateTimeLong } from '@/lib/format'
/**
 * Which build is running. The values are stamped in at build time by next.config.ts:
 *   version  from package.json
 *   build    short git commit of the build (a trailing + means it was built with uncommitted changes)
 *   builtAt  when the build was made
 * Safe to import from both server and client code.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0'
export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || ''
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || ''

/** e.g. "v0.1.0 · c5d3e75" (the build part is left out when unknown) */
export const versionLabel = () => `v${APP_VERSION}${BUILD_SHA ? ` · ${BUILD_SHA}` : ''}`

/** e.g. "Built 14 Oct 2026, 10:32" for a tooltip */
export function buildTitle(): string {
  if (!BUILD_TIME) return `Version ${APP_VERSION}`
  const d = new Date(BUILD_TIME)
  const when = isNaN(d.getTime()) ? BUILD_TIME : formatDateTimeLong(d)
  return `Version ${APP_VERSION}${BUILD_SHA ? `, build ${BUILD_SHA}` : ''}. Built ${when}`
}
