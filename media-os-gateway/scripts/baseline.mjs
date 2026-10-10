import { spawnSync } from 'node:child_process'
import pg from 'pg'

// Explicit one-time adoption of a populated database; never reset or alter domain tables.
const run = (args) => {
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], {
    stdio: 'inherit',
  })
  if (result.status !== 0) throw new Error(`Prisma ${args[0]} failed; baseline stopped.`)
}
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5000,
})
try {
  const existing = await pool.query("SELECT to_regclass('public._prisma_migrations') AS migrations")
  if (existing.rows[0].migrations) {
    const applied = await pool.query(
      "SELECT migration_name FROM _prisma_migrations WHERE migration_name='0_init' AND finished_at IS NOT NULL AND rolled_back_at IS NULL",
    )
    if (applied.rowCount) {
      console.log('Baseline already applied.')
      process.exitCode = 0
    } else
      throw new Error(
        'Migration history exists without the baseline. Inspect it before proceeding.',
      )
  } else {
    run([
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/baseline.prisma',
      '--exit-code',
    ])
    const checks = await pool.query(
      "SELECT conname FROM pg_constraint WHERE contype='c' AND convalidated AND connamespace='public'::regnamespace",
    )
    const names = new Set(checks.rows.map((r) => r.conname))
    for (const name of [
      'inventory_price_check',
      'inventory_check',
      'creatives_kind_check',
      'campaigns_status_check',
      'campaigns_check',
      'playlist_items_position_check',
      'playback_sessions_mode_check',
    ]) {
      if (!names.has(name)) throw new Error(`Existing CHECK constraint missing: ${name}`)
    }
    run(['migrate', 'resolve', '--applied', '0_init'])
  }
} finally {
  await pool.end()
}
