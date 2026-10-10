import { readFile } from 'node:fs/promises'
import pg from '../media-os-gateway/node_modules/pg/lib/index.js'

const env = await readFile(new URL('../media-os-gateway/.env', import.meta.url), 'utf8')
const value = (key) => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]
const seed = JSON.parse(
  await readFile(new URL('../media-os-gateway/data/seed.json', import.meta.url), 'utf8').catch(
    (error) => {
      if (error.code !== 'ENOENT') throw error
      return readFile(
        new URL('../media-os-gateway/data/seed.example.json', import.meta.url),
        'utf8',
      )
    },
  ),
)
const db = new pg.Client({
  host: '127.0.0.1',
  port: Number(value('POSTGRES_PORT') || 5433),
  user: 'media_os',
  database: 'media_os',
  password: value('POSTGRES_PASSWORD'),
})
await db.connect()
try {
  await db.query('BEGIN')
  await db.query('SELECT pg_advisory_xact_lock(804026)')
  let created = 0
  for (const screen of seed.screens) {
    const result = await db.query(
      'INSERT INTO screens(id,inventory_id,payload) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',
      [screen.id, screen.inventoryId, JSON.stringify(screen)],
    )
    created += result.rowCount
    if (result.rowCount)
      await db.query(
        "UPDATE workspace_settings SET payload=payload - $1 WHERE key='seedTombstones'",
        [`screens/${screen.id}`],
      )
  }
  await db.query('COMMIT')
  console.log(
    `Created ${created} sample screens. Existing screens and all other workspace data preserved. Pairing and playlists start empty.`,
  )
} catch (error) {
  await db.query('ROLLBACK')
  throw error
} finally {
  await db.end()
}
