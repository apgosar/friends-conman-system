// Runs the whole test suite against a throwaway Postgres you already have running.
//   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/neev_test npm run test:db
import { spawnSync } from 'node:child_process'
if (!process.env.TEST_DATABASE_URL) {
  console.error('Set TEST_DATABASE_URL to an EMPTY, disposable database first (its tables are truncated by the tests).')
  process.exit(1)
}
const r = spawnSync('npx', ['vitest', 'run'], { stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(r.status ?? 1)
