import { loginAdmin } from './auth-helpers.js'

const adminHeaders = await loginAdmin()

import assert from 'node:assert/strict'
import test from 'node:test'

const base = process.env.GATEWAY_TEST_URL ?? 'http://127.0.0.1:4000'
const headers = adminHeaders

test('Nest HTTP boundaries preserve health, auth, JSON limits and error contract', async () => {
  const health = await fetch(`${base}/health`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok', database: 'postgresql' })
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(health.headers.get('x-powered-by'), null)

  const unauthorized = await fetch(`${base}/v1/projects`)
  assert.equal(unauthorized.status, 401)
  assert.deepEqual(await unauthorized.json(), { error: 'Sign in required or session expired.' })

  const malformed = await fetch(`${base}/v1/import`, { method: 'POST', headers, body: '{' })
  assert.equal(malformed.status, 400)
  assert.equal(typeof (await malformed.json()).error, 'string')

  const oversized = await fetch(`${base}/v1/import`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ignored: 'x'.repeat(2 * 1024 * 1024) }),
  })
  assert.equal(oversized.status, 413)
  assert.equal(typeof (await oversized.json()).error, 'string')

  const upload = await fetch(`${base}/v1/creatives/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.alloc(16),
  })
  assert.equal(upload.status, 401)
  assert.deepEqual(await upload.json(), { error: 'Sign in required or session expired.' })

  const notFound = await fetch(`${base}/missing`)
  assert.equal(notFound.status, 404)
  assert.equal(typeof (await notFound.json()).error, 'string')
})
