import assert from 'node:assert/strict'
import test from 'node:test'
import pg from 'pg'
import { loginAdmin } from './auth-helpers.js'

const base = process.env.GATEWAY_TEST_URL ?? 'http://127.0.0.1:4000'
test('mock connection disconnect persists, preserves sync history, and reconnects', async () => {
  const headers = await loginAdmin(),
    db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const identity = 'connection-Agency'
  const previous = (await db.query('SELECT * FROM programmatic_records WHERE id=$1', [identity]))
    .rows[0]
  const call = async (action, body) => {
    const response = await fetch(`${base}/v1/programmatic/connections/${action}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    return { status: response.status, data: await response.json() }
  }
  try {
    assert.equal((await call('disconnect', { name: 'Unknown' })).status, 404)
    const synced = await call('sync', { name: 'Agency' })
    assert.equal(synced.status, 200)
    const disconnected = await call('disconnect', { name: 'Agency' })
    assert.equal(disconnected.status, 200)
    assert.equal(disconnected.data.status, 'Disconnected')
    assert.equal(disconnected.data.lastSync, synced.data.lastSync)
    assert.equal(disconnected.data.inventorySynced, synced.data.inventorySynced)
    assert.equal(disconnected.data.creativeSynced, synced.data.creativeSynced)
    assert(disconnected.data.disconnectedAt)
    const saved = await (await fetch(`${base}/v1/programmatic/connections`, { headers })).json()
    assert.equal(saved.find((c) => c.name === 'Agency').status, 'Disconnected')
    assert.equal((await call('disconnect', { name: 'Agency' })).status, 200)
    assert.equal((await call('sync', { name: 'Agency' })).data.status, 'Connected')
    await call('sync', { name: 'Agency', simulateError: true })
    assert.equal((await call('disconnect', { name: 'Agency' })).data.error, null)
  } finally {
    if (previous)
      await db.query('UPDATE programmatic_records SET payload=$2,updated_at=$3 WHERE id=$1', [
        identity,
        previous.payload,
        previous.updated_at,
      ])
    else await db.query('DELETE FROM programmatic_records WHERE id=$1', [identity])
    await db.end()
  }
})
