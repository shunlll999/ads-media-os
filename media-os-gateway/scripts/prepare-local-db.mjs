import { spawnSync } from 'node:child_process'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5000,
})
let needsBaseline
try {
  const { rows } = await pool.query(
    "SELECT to_regclass('public.projects') AS projects, to_regclass('public._prisma_migrations') AS migrations",
  )
  needsBaseline = Boolean(rows[0].projects && !rows[0].migrations)
} finally {
  await pool.end()
}
const run = (args) => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (result.status !== 0)
    throw new Error('Local database preparation failed; gateway startup stopped.')
}
// Adopt a pre-Prisma local volume only after the baseline script verifies its schema.
if (needsBaseline) run(['scripts/baseline.mjs'])
run(['node_modules/prisma/build/index.js', 'migrate', 'deploy'])
