import assert from 'node:assert/strict'
import test from 'node:test'
import pg from 'pg'
import { loginAdmin } from './auth-helpers.js'

const base = process.env.GATEWAY_TEST_URL ?? 'http://127.0.0.1:4000'
test('unused screen deletion cleans disabled onboarding and protects operational/history records', async () => {
  const admin = await loginAdmin()
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const identity = `screen-delete-qa-${crypto.randomUUID()}`
  const profileId = `profile-${identity}`
  const playbackId = crypto.randomUUID()
  const remove = async (headers = admin) => {
    const response = await fetch(`${base}/v1/cms/records/screens/${identity}`, {
      method: 'DELETE',
      headers,
    })
    return { status: response.status, body: await response.json() }
  }
  try {
    const inventory = (await db.query('SELECT id FROM inventory LIMIT 1')).rows[0]
    const creative = { id: `${identity}-creative` }
    const campaign = { id: `${identity}-campaign` }
    await db.query('INSERT INTO creatives(id,kind,payload) VALUES($1,$2,$3)', [
      creative.id,
      'image',
      JSON.stringify({ id: creative.id, name: identity }),
    ])
    await db.query(
      'INSERT INTO campaigns(id,creative_id,status,start_date,end_date,payload) VALUES($1,$2,$3,$4,$5,$6)',
      [
        campaign.id,
        creative.id,
        'Planning',
        '2026-01-01',
        '2027-12-31',
        JSON.stringify({ id: campaign.id, name: identity }),
      ],
    )
    assert(inventory && creative && campaign)
    await db.query('INSERT INTO screens(id,inventory_id,payload) VALUES($1,$2,$3)', [
      identity,
      inventory.id,
      JSON.stringify({ id: identity, name: identity }),
    ])
    await db.query('INSERT INTO programmatic_records(id,kind,payload) VALUES($1,$2,$3)', [
      profileId,
      'profile',
      JSON.stringify({ screenId: identity, enabled: true }),
    ])
    assert.equal((await remove({})).status, 401)
    assert.match((await remove()).body.error, /Disable it in onboarding/)
    await db.query('UPDATE programmatic_records SET payload=$2 WHERE id=$1', [
      profileId,
      JSON.stringify({ screenId: identity, enabled: false }),
    ])
    await db.query('UPDATE screens SET last_seen_at=now() WHERE id=$1', [identity])
    assert.match((await remove()).body.error, /Screen is online/)
    await db.query('UPDATE screens SET last_seen_at=NULL WHERE id=$1', [identity])
    await db.query(
      'INSERT INTO playlist_items(screen_id,creative_id,campaign_id,position) VALUES($1,$2,$3,0)',
      [identity, creative.id, campaign.id],
    )
    assert.match((await remove()).body.error, /deployed campaign/)
    await db.query('UPDATE playlist_items SET campaign_id=NULL WHERE screen_id=$1', [identity])
    assert.equal((await remove()).status, 200)
    for (const [table, column, value] of [
      ['screens', 'id', identity],
      ['playlist_items', 'screen_id', identity],
      ['programmatic_records', 'id', profileId],
    ]) {
      assert.equal(
        (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column}=$1`, [value]))
          .rows[0].n,
        0,
      )
    }
    assert.equal((await remove()).status, 404)
    await db.query('INSERT INTO screens(id,inventory_id,payload,token_hash) VALUES($1,$2,$3,$4)', [
      identity,
      inventory.id,
      JSON.stringify({ id: identity, name: identity }),
      'old-token-hash',
    ])
    await db.query(
      'INSERT INTO playback_sessions(id,screen_id,creative_id,mode) VALUES($1,$2,$3,$4)',
      [playbackId, identity, creative.id, 'preview'],
    )
    const archived = await remove()
    assert.equal(archived.status, 200)
    assert.equal(archived.body.archived, true)
    const retained = (
      await db.query('SELECT payload,token_hash FROM screens WHERE id=$1', [identity])
    ).rows[0]
    assert(retained.payload.archivedAt)
    assert.equal(retained.token_hash, null)
    assert.equal(
      (await db.query('SELECT count(*)::int AS n FROM playback_sessions WHERE id=$1', [playbackId]))
        .rows[0].n,
      1,
    )
    for (const path of ['/screens', '/cms/records/screens', '/programmatic/screens']) {
      const body = await (await fetch(`${base}/v1${path}`, { headers: admin })).json()
      assert.equal(
        (body.data ?? body).some((s) => s.id === identity),
        false,
      )
    }
    assert.equal(
      (await fetch(`${base}/v1/screens/${identity}/pair`, { method: 'POST', headers: admin }))
        .status,
      404,
    )
    assert.equal(
      (
        await fetch(`${base}/v1/player/${identity}/playlist`, {
          headers: { 'x-screen-token': 'old-token' },
        })
      ).status,
      401,
    )
    assert.equal((await remove()).status, 404)
  } finally {
    await db.query('DELETE FROM playback_sessions WHERE screen_id=$1', [identity])
    await db.query('DELETE FROM screens WHERE id=$1', [identity])
    await db.query('DELETE FROM programmatic_records WHERE id=$1', [profileId])
    await db.query('DELETE FROM campaigns WHERE id=$1', [`${identity}-campaign`])
    await db.query('DELETE FROM creatives WHERE id=$1', [`${identity}-creative`])
    await db.query(
      "UPDATE workspace_settings SET payload=payload - $1 WHERE key='seedTombstones'",
      [`screens/${identity}`],
    )
    await db.query('DELETE FROM audit_logs WHERE resource=$1', [`screens/${identity}`])
    await db.end()
  }
})
