import { loginAdmin } from './auth-helpers.js'

const adminHeaders = await loginAdmin()

import assert from 'node:assert/strict'
import test from 'node:test'
import pg from 'pg'
import { days, plan } from '../dist/domain.js'

const base = process.env.GATEWAY_TEST_URL ?? 'http://127.0.0.1:4000'
const prefix = `qa-${crypto.randomUUID()}`
const created = { screens: [], campaigns: [], creatives: [] }
async function request(path, body, method = 'POST', token) {
  const r = await fetch(base + path, {
    method: body === undefined ? 'GET' : method,
    headers: token ? { 'x-screen-token': token, 'Content-Type': 'application/json' } : adminHeaders,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, data: await r.json() }
}
test('real contracts, transaction rollback, pairing, schedule, telemetry and lifecycle', async () => {
  const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const project = {
    id: prefix,
    name: 'QA real product',
    category: 'Product',
    url: 'https://example.com',
    image: '/assets/demo-launch.svg',
    description: 'Imported project',
    capabilities: ['Data integration'],
    publicStatus: 'Public',
    reviewedAt: '2026-10-06',
    suggestedBrief: { name: 'QA launch', objective: 'Product Launch', audience: 'Bangkok' },
  }
  const placement = {
    id: prefix,
    name: 'QA placement',
    area: 'QA location',
    type: 'Digital Billboard',
    price: 7000,
    latitude: 13.7,
    longitude: 100.5,
    availableFrom: '2026-01-01',
    availableTo: '2027-12-31',
    dataSource: 'real',
  }
  try {
    assert.equal((await fetch(`${base}/v1/media`)).status, 401)
    assert.equal(days('2026-10-06', '2026-10-12'), 7)
    assert.equal(
      (await request('/v1/import', { projects: [project], inventory: [placement] })).status,
      200,
    )
    const invalid = await request('/v1/import', {
      projects: [{ ...project, id: `${prefix}-rollback` }],
      inventory: [{ ...placement, id: `${prefix}-bad`, price: -1 }],
    })
    assert.equal(invalid.status, 400)
    assert.equal(
      (await request('/v1/projects')).data.data.some((p) => p.id === `${prefix}-rollback`),
      false,
    )
    const creative = await request('/v1/creatives', {
      name: 'QA project card',
      kind: 'project',
      projectId: prefix,
      durationSeconds: 2,
    })
    assert.equal(creative.status, 201)
    created.creatives.push(creative.data.id)
    assert.equal(
      (await request('/v1/creatives', { name: 'bad URL', kind: 'web', url: 'javascript:alert(1)' }))
        .status,
      400,
    )
    const p = await request('/v1/media-plan', {
      budget: 1000000,
      startDate: '2026-10-06',
      endDate: '2026-10-12',
      objective: 'Product Launch',
      audience: 'Bangkok',
      areas: ['QA location'],
    })
    assert.equal(p.status, 201)
    assert.equal(p.data.totalCost, 7000)
    const input = {
      name: 'QA campaign',
      objective: 'Product Launch',
      startDate: '2026-10-06',
      endDate: '2026-10-12',
      budget: 7000,
      inventoryIds: [prefix],
      creativeId: creative.data.id,
      sourceProjectId: prefix,
    }
    assert.equal((await request('/v1/campaigns', { ...input, budget: 1 })).status, 400)
    const campaign = await request('/v1/campaigns', input)
    assert.equal(campaign.status, 201)
    created.campaigns.push(campaign.data.id)
    assert.equal(
      (await request(`/v1/campaigns/${campaign.data.id}/status`, { status: 'Live' })).status,
      409,
    )
    assert.equal(
      (await request(`/v1/campaigns/${campaign.data.id}/status`, { status: 'Approved' })).status,
      200,
    )
    assert.equal(
      (await request(`/v1/campaigns/${campaign.data.id}/status`, { status: 'Live' })).status,
      200,
    )
    const screen = await request('/v1/screens', {
      name: 'QA screen',
      inventoryId: prefix,
      location: 'QA location',
      latitude: 13.7,
      longitude: 100.5,
      format: 'portrait',
      width: 1080,
      height: 1920,
      preview: true,
    })
    assert.equal(screen.status, 201)
    created.screens.push(screen.data.id)
    const pairing = await request(`/v1/screens/${screen.data.id}/pair`, {})
    const token = pairing.data.token
    assert.equal(
      (await request(`/v1/player/${screen.data.id}/playlist`, undefined, 'GET', 'wrong-token'))
        .status,
      401,
    )
    assert.equal(
      (await request('/v1/deploy', { campaignId: campaign.data.id, screenIds: [screen.data.id] }))
        .status,
      200,
    )
    const playlist = (
      await request(`/v1/player/${screen.data.id}/playlist`, undefined, 'GET', token)
    ).data
    assert.equal(playlist.items[0].project.id, prefix)
    assert.equal(playlist.items[0].mode, 'preview')
    assert.equal(
      (
        await request('/v1/deploy', {
          campaignId: campaign.data.id,
          screenIds: [screen.data.id, 'missing-screen'],
        })
      ).status,
      404,
    )
    assert.equal(
      (await request(`/v1/screens/${screen.data.id}/playlist`)).data.data[0].campaignId,
      campaign.data.id,
    )
    const session = crypto.randomUUID()
    await request(
      `/v1/player/${screen.data.id}/plays`,
      { sessionId: session, creativeId: creative.data.id, event: 'start' },
      'POST',
      token,
    )
    await new Promise((r) => setTimeout(r, 1100))
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await request(
            `/v1/player/${screen.data.id}/plays`,
            {
              sessionId: session,
              creativeId: creative.data.id,
              event: 'complete',
              durationMs: 1100,
            },
            'POST',
            token,
          )
        ).status,
        200,
      )
    const metrics = (await request(`/v1/campaigns/${campaign.data.id}/analytics`)).data
    assert.equal(metrics.deliveredPlays, 0)
    assert.equal(metrics.previewPlays, 1)
    assert.equal(metrics.reach, 'Not measured')
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
    await database.query('UPDATE campaigns SET start_date=$2,end_date=$2 WHERE id=$1', [
      campaign.data.id,
      today,
    ])
    await request(`/v1/screens/${screen.data.id}`, { ...screen.data, preview: false }, 'PATCH')
    await request('/v1/deploy', { campaignId: campaign.data.id, screenIds: [screen.data.id] })
    assert.equal(
      (await request(`/v1/player/${screen.data.id}/playlist`, undefined, 'GET', token)).data
        .items[0].mode,
      'live',
    )
    const liveSession = crypto.randomUUID()
    await request(
      `/v1/player/${screen.data.id}/plays`,
      { sessionId: liveSession, creativeId: creative.data.id, event: 'start' },
      'POST',
      token,
    )
    await new Promise((resolve) => setTimeout(resolve, 1100))
    await request(
      `/v1/player/${screen.data.id}/plays`,
      { sessionId: liveSession, creativeId: creative.data.id, event: 'complete', durationMs: 1100 },
      'POST',
      token,
    )
    const liveMetrics = (await request(`/v1/campaigns/${campaign.data.id}/analytics`)).data
    assert.equal(liveMetrics.deliveredPlays, 1)
    assert.equal(liveMetrics.previewPlays, 1)
    const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10)
    await database.query('UPDATE campaigns SET start_date=$2,end_date=$2 WHERE id=$1', [
      campaign.data.id,
      tomorrow,
    ])
    assert.equal(
      (await request(`/v1/player/${screen.data.id}/playlist`, undefined, 'GET', token)).data.items
        .length,
      0,
    )
    await request(`/v1/campaigns/${campaign.data.id}/status`, { status: 'Completed' })
    assert.equal(
      (await request(`/v1/player/${screen.data.id}/playlist`, undefined, 'GET', token)).data.items
        .length,
      0,
    )
    assert.throws(() =>
      plan(
        {
          budget: 1,
          startDate: '2026-10-06',
          endDate: '2026-10-12',
          objective: 'Product Launch',
          audience: 'Bangkok',
        },
        [placement],
      ),
    )
    const malicious = await fetch(`${base}/v1/creatives/upload`, {
      method: 'POST',
      headers: { ...adminHeaders, 'Content-Type': 'image/png' },
      body: '<script>alert(1)</script>',
    })
    assert.equal(malicious.status, 400)
  } finally {
    await database.query('DELETE FROM playback_sessions WHERE screen_id=ANY($1::text[])', [
      created.screens,
    ])
    await database.query('DELETE FROM playlist_items WHERE screen_id=ANY($1::text[])', [
      created.screens,
    ])
    await database.query('DELETE FROM screens WHERE id=ANY($1::text[])', [created.screens])
    await database.query('DELETE FROM campaign_inventory WHERE campaign_id=ANY($1::text[])', [
      created.campaigns,
    ])
    await database.query('DELETE FROM campaigns WHERE id=ANY($1::text[])', [created.campaigns])
    await database.query('DELETE FROM creatives WHERE id=ANY($1::text[])', [created.creatives])
    await database.query('DELETE FROM inventory WHERE id LIKE $1', [`${prefix}%`])
    await database.query('DELETE FROM projects WHERE id LIKE $1', [`${prefix}%`])
    await database.end()
  }
})

test('legacy inventory JSON stays unchanged on reads and export', async () => {
  const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const identity = `legacy-${crypto.randomUUID()}`
  try {
    const original = (await database.query('SELECT payload FROM inventory LIMIT 1')).rows[0].payload
    const payload = { ...original, id: identity, legacyMetadata: { retained: true } }
    delete payload.dataSource
    await database.query(
      'INSERT INTO inventory(id,area,price,available_from,available_to,payload) VALUES($1,$2,$3,$4,$5,$6)',
      [identity, payload.area, payload.price, payload.availableFrom, payload.availableTo, payload],
    )
    assert.deepEqual((await request(`/v1/media/${identity}`)).data, payload)
    const exported = (await request('/v1/export')).data
    assert.deepEqual(
      exported.inventory.find((i) => i.id === identity),
      payload,
    )
  } finally {
    await database.query('DELETE FROM inventory WHERE id=$1', [identity])
    await database.end()
  }
})
