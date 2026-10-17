import { it, expect, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import { describeDb } from './helpers/db'

/**
 * The path every existing customer takes: a database built by `prisma db push` before migrations existed is
 * baselined (`migrate resolve --applied 0_init`) and then `migrate deploy` applies the hardening migration on top of
 * their real data. Runs on scratch databases created next to the test database.
 */
const base = process.env.TEST_DATABASE_URL ?? ''
const withDb = (name: string) => base.replace(/\/([^/?]+)(\?|$)/, `/${name}$2`)
// psql does not understand Prisma's connection options (connection_limit, schema...), so they are dropped for it
const forPsql = (url: string) =>
  url.replace(/([?&])(connection_limit|pool_timeout|schema|pgbouncer)=[^&]*&?/g, '$1').replace(/[?&]$/, '')
const sh = (cmd: string, env: Record<string, string> = {}) =>
  execSync(cmd, { env: { ...process.env, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1', ...env }, stdio: 'pipe', encoding: 'utf8' })
const psql = (db: string, sql: string) => sh(`psql "${forPsql(withDb(db))}" -v ON_ERROR_STOP=1 -At -c "${sql.replace(/"/g, '\\"')}"`).trim()
const admin = (sql: string) => sh(`psql "${forPsql(base)}" -v ON_ERROR_STOP=1 -At -c "${sql}"`)

const created: string[] = []
function freshLegacyDatabase(name: string) {
  admin(`DROP DATABASE IF EXISTS ${name}`)
  admin(`CREATE DATABASE ${name}`)
  created.push(name)
  sh(`psql "${forPsql(withDb(name))}" -v ON_ERROR_STOP=1 -q -f prisma/migrations/0_init/migration.sql`) // what db push built
}
function seedLegacyRows(db: string) {
  psql(db, `INSERT INTO users (id, name, email, password, role, "updatedAt") VALUES ('u1','Old Accounts','acc@example.com','x','ACCOUNTS',now()), ('u2','Boss','boss@example.com','x','SUPER_ADMIN',now())`)
  psql(db, `INSERT INTO projects (id, name, address, city, "companyName", "companyAddress", "updatedAt") VALUES ('p1','Old Project','Rd','Mumbai','Co','Addr',now())`)
  psql(db, `INSERT INTO wings (id, "projectId", name, "totalFloors") VALUES ('w1','p1','A',1)`)
  psql(db, `INSERT INTO floors (id, "wingId", "floorNumber") VALUES ('f1','w1',1)`)
  psql(db, `INSERT INTO units (id, "floorId", "unitNumber", configuration, "carpetAreaSqft", "updatedAt") VALUES ('un1','f1','A-101','2BHK',700,now())`)
  psql(db, `INSERT INTO sales (id, "saleNumber", "projectId", "unitId", "agreementValue", "gstAmount", "bookingDate", "updatedAt") VALUES ('s1','OP-001','p1','un1',12345678.9,617283.945,now(),now())`)
}

describeDb('upgrading an existing database', () => {
  afterAll(() => { for (const n of created) try { admin(`DROP DATABASE IF EXISTS ${n}`) } catch { /* best effort */ } })

  it('keeps every row, converts money to exact numbers, fixes unknown roles and adds the guards', () => {
    freshLegacyDatabase('neev_upgrade_ok')
    seedLegacyRows('neev_upgrade_ok')
    const env = { DATABASE_URL: withDb('neev_upgrade_ok') }
    sh('npx prisma migrate resolve --applied 0_init', env)
    sh('npx prisma migrate deploy', env)

    expect(psql('neev_upgrade_ok', `SELECT "saleNumber" || ':' || "agreementValue" || ':' || "gstAmount" FROM sales`)).toBe('OP-001:12345678.90:617283.95')
    expect(psql('neev_upgrade_ok', `SELECT data_type || '(' || numeric_precision || ',' || numeric_scale || ')' FROM information_schema.columns WHERE table_name='payments' AND column_name='amount'`)).toBe('numeric(15,2)')
    expect(psql('neev_upgrade_ok', `SELECT role FROM users ORDER BY id`)).toBe('VIEWER\nSUPER_ADMIN')
    expect(psql('neev_upgrade_ok', `SELECT "stampDutyPercent" || ',' || "gstRatePercent" || ',' || "regChargesCap" FROM projects`)).toBe('6,5,30000.00')
    expect(psql('neev_upgrade_ok', `SELECT count(*) FROM pg_indexes WHERE indexname = 'sales_one_active_per_unit'`)).toBe('1')
    // the new guards really bite
    expect(() => psql('neev_upgrade_ok', `INSERT INTO users (id, name, email, password, role, "updatedAt") VALUES ('u3','x','x@example.com','x','GOD',now())`)).toThrow(/users_role_check/)
    expect(() => psql('neev_upgrade_ok', `INSERT INTO sales (id, "saleNumber", "projectId", "unitId", "agreementValue", "gstAmount", "bookingDate", "updatedAt") VALUES ('s2','OP-002','p1','un1',1,0,now(),now())`)).toThrow(/sales_one_active_per_unit/)
  })

  it('stops with a readable message when a unit already has two active sales, and changes nothing', () => {
    freshLegacyDatabase('neev_upgrade_dup')
    seedLegacyRows('neev_upgrade_dup')
    psql('neev_upgrade_dup', `INSERT INTO sales (id, "saleNumber", "projectId", "unitId", "agreementValue", "gstAmount", "bookingDate", "updatedAt") VALUES ('s2','OP-002','p1','un1',1,0,now(),now())`)
    const env = { DATABASE_URL: withDb('neev_upgrade_dup') }
    sh('npx prisma migrate resolve --applied 0_init', env)
    let output = ''
    try { sh('npx prisma migrate deploy', env) } catch (e: any) { output = `${e.stdout}${e.stderr}` }
    expect(output).toMatch(/more than one active sale: A-101/)
    expect(psql('neev_upgrade_dup', `SELECT data_type FROM information_schema.columns WHERE table_name='payments' AND column_name='amount'`)).toBe('double precision')
  })
})
