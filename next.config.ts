import type { NextConfig } from 'next'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Which build is this? Shown in the app and returned by /api/health, so you can tell what is running.
const packageVersion: string = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version
// A release build is given its git tag (docker build --build-arg APP_VERSION=v0.0.5), so the app reports the release it came from.
// The leading "v" is dropped because the label adds its own.
const appVersion: string = (process.env.APP_VERSION?.trim() || packageVersion).replace(/^v/i, '')
const buildSha = (): string => {
  // A Docker build has no .git, so the build can be given the commit: docker build --build-arg BUILD_SHA=<sha>
  if (process.env.BUILD_SHA) return process.env.BUILD_SHA.trim().slice(0, 7)
  try {
    const run = (cmd: string) => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    // Untracked files (notes, slide decks) don't make a build "modified", only changes to tracked files do
    return run('git rev-parse --short HEAD') + (run('git status --porcelain --untracked-files=no') ? '+' : '')
  } catch {
    return ''
  }
}

const isProd = process.env.NODE_ENV === 'production'

// The API is only called by this app's own pages, so there are no CORS headers: other sites' scripts cannot call it with a signed-in user's cookies.
const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_BUILD_SHA: buildSha(),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  serverExternalPackages: ['tesseract.js'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next.js inlines small bootstrap scripts, so 'unsafe-inline' stays until the CSP moves to per-request nonces. eval is only for dev tooling.
              `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:", // fonts are self-hosted (@fontsource), nothing is loaded from Google
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://graph.facebook.com https://ocr.azapi.ai",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

import { withSentryConfig } from '@sentry/nextjs'

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  tunnelRoute: '/monitoring',

  // Use the new webpack-scoped options to avoid deprecation warnings
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
    reactComponentAnnotation: {
      enabled: true,
    },
    automaticVercelMonitors: false,
  },
})
