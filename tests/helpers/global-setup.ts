import { execSync } from 'node:child_process'

/**
 * Integration tests run against a real Postgres (TEST_DATABASE_URL). Applying the committed migrations here means the
 * test database has exactly the schema production gets, indexes and CHECK constraints included.
 * Without TEST_DATABASE_URL the integration suites skip themselves and only the unit tests run.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) return
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  })
}
