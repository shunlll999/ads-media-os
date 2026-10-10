import { loginAdmin } from './auth-helpers.js'

const adminHeaders = await loginAdmin()

import assert from 'node:assert/strict'
import test from 'node:test'
import pg from 'pg'

const base = process.env.GATEWAY_TEST_URL ?? 'http://127.0.0.1:4000'
const prefix = `pgqa-${crypto.randomUUID()}`
async function req(path, body) {
  const r = await fetch(`${base}/v1${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: adminHeaders,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, data: await r.json() }
}
test('programmatic onboarding, forecast, lifecycle, deduplication, budget, metrics and collection', async () => {
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const ids = { screens: [], deals: [] }
  const placement = {
    id: prefix,
    name: 'Programmatic QA',
    area: 'Bangkok',
    type: 'Digital Billboard',
    price: 1000,
    latitude: 13.7,
    longitude: 100.5,
    availableFrom: '2026-01-01',
    availableTo: '2027-12-31',
    dataSource: 'mock',
  }
  try {
    assert.equal((await req('/import', { inventory: [placement] })).status, 200)
    const screen = await req('/screens', {
      name: prefix,
      inventoryId: prefix,
      location: 'Bangkok',
      latitude: 13.7,
      longitude: 100.5,
      format: 'landscape',
      width: 1920,
      height: 1080,
      preview: true,
    })
    assert.equal(screen.status, 201)
    ids.screens.push(screen.data.id)
    const profile = {
      venueId: prefix,
      latitude: 13.7,
      longitude: 100.5,
      screenSize: '6m',
      width: 1920,
      height: 1080,
      slotDuration: 15,
      loopDuration: 120,
      operatingStart: '06:00',
      operatingEnd: '23:00',
      cms: 'QA CMS',
      ssp: prefix,
      sspInventoryId: prefix,
      floorCpm: 100,
      audiencePerPlay: 30,
    }
    assert.equal(
      (await req(`/programmatic/screens/${screen.data.id}/profile`, profile)).status,
      200,
    )
    assert.equal(
      (await req(`/programmatic/screens/${screen.data.id}/enable`, { enabled: true })).status,
      409,
    )
    assert.equal((await req(`/programmatic/screens/${screen.data.id}/test`, {})).data.mode, 'mock')
    assert.equal(
      (await req(`/programmatic/screens/${screen.data.id}/enable`, { enabled: true })).data.enabled,
      true,
    )
    const body = {
      name: prefix,
      type: 'PMP',
      dsp: prefix,
      ssp: prefix,
      inventoryIds: [prefix],
      cpm: 200,
      floorCpm: 100,
      budget: 10000,
      startDate: '2026-01-01',
      endDate: '2027-12-31',
      impressionTarget: 10000,
    }
    assert.equal((await req('/programmatic/deals', { ...body, cpm: 90 })).status, 400)
    const deal = await req('/programmatic/deals', body)
    assert.equal(deal.status, 201)
    ids.deals.push(deal.data.id)
    assert.equal(
      (await req(`/programmatic/deals/${deal.data.id}/status`, { status: 'Active' })).data.status,
      'Active',
    )
    const event = {
      id: prefix,
      dealId: deal.data.id,
      inventoryId: prefix,
      source: 'mock',
      occurredAt: new Date().toISOString(),
      impressions: 1000,
      requests: 100,
      bids: 50,
      wins: 20,
      spend: 200,
      sspFee: 30,
      cost: 100,
    }
    assert.equal((await req('/programmatic/transactions', event)).data.duplicate, false)
    assert.equal((await req('/programmatic/transactions', event)).data.duplicate, true)
    assert.equal((await req('/programmatic/transactions', { ...event, spend: 300 })).status, 409)
    assert.equal(
      (await req('/programmatic/transactions', { ...event, id: `${prefix}-over`, spend: 10000 }))
        .status,
      409,
    )
    assert.equal(
      (
        await req('/programmatic/transactions', {
          ...event,
          id: `${prefix}-source`,
          source: 'partner',
        })
      ).status,
      409,
    )
    assert.equal(
      (await req('/programmatic/transactions', { ...event, id: `${prefix}-bad`, bids: 101 }))
        .status,
      400,
    )
    const m = (await req(`/programmatic/deals/${deal.data.id}/metrics?period=hour`)).data
    assert.equal(m.transactionCount, 1)
    assert.equal(m.impressions, 1000)
    assert.equal(m.spend, 200)
    assert.equal(m.cpm, 200)
    assert.equal(m.fillRate, 20)
    assert.equal(m.winRate, 40)
    assert.equal(m.revenue, 170)
    assert.equal(m.margin, 70)
    assert.equal(m.series.length, 1)
    const transactionList = await req(
      `/programmatic/transactions?dealId=${deal.data.id}&source=mock&page=1`,
    )
    assert.equal(transactionList.status, 200)
    assert.equal(transactionList.data.total, 1)
    assert.equal(transactionList.data.data[0].id, event.id)
    assert.equal(transactionList.data.data[0].spend, 200)
    assert.equal((await req('/programmatic/transactions?page=0')).status, 400)
    assert.equal((await req('/programmatic/transactions?source=invalid')).status, 400)

    assert.equal(
      (
        await req(`/programmatic/deals/${deal.data.id}/commercial`, {
          stage: 'Paid',
          reference: 'qa',
        })
      ).status,
      400,
    )
    for (const stage of ['Quotation', 'Campaign', 'Invoice', 'Paid'])
      assert.equal(
        (
          await req(`/programmatic/deals/${deal.data.id}/commercial`, {
            stage,
            reference: `${prefix}-${stage}`,
          })
        ).data.stage,
        stage,
      )
    assert.equal(
      (await req(`/programmatic/deals/${deal.data.id}/status`, { status: 'Paused' })).data.status,
      'Paused',
    )
    assert.equal(
      (await req('/programmatic/transactions', { ...event, id: `${prefix}-paused` })).status,
      409,
    )
    assert.equal(
      (await req(`/programmatic/deals/${deal.data.id}/status`, { status: 'Completed' })).data
        .status,
      'Completed',
    )
    assert.equal(
      (await req(`/programmatic/deals/${deal.data.id}/status`, { status: 'Active' })).status,
      409,
    )
    const pg = await req('/programmatic/deals', {
      ...body,
      type: 'PG',
      impressionTarget: 50000,
      startDate: '2026-10-08',
      endDate: '2026-10-08',
    })
    assert.equal(pg.status, 201)
    ids.deals.push(pg.data.id)
    assert.equal(
      (await req(`/programmatic/deals/${pg.data.id}/status`, { status: 'Active' })).status,
      409,
    )
    assert.equal(
      (await req(`/programmatic/screens/${screen.data.id}/profile`, profile)).data.enabled,
      false,
    )
    const partner = await req('/programmatic/deals', {
      ...body,
      source: 'partner',
      dsp: `${prefix}-partner`,
    })
    assert.equal(partner.status, 201)
    ids.deals.push(partner.data.id)
    assert.equal(
      (await req(`/programmatic/deals/${partner.data.id}/status`, { status: 'Active' })).status,
      409,
    )
    await req(`/programmatic/screens/${screen.data.id}/test`, {})
    await req(`/programmatic/screens/${screen.data.id}/enable`, { enabled: true })
    assert.equal(
      (await req(`/programmatic/deals/${partner.data.id}/status`, { status: 'Active' })).status,
      200,
    )
    assert.equal(
      (
        await req('/programmatic/transactions', {
          ...event,
          id: `${prefix}-partner`,
          dealId: partner.data.id,
          source: 'partner',
        })
      ).status,
      200,
    )
    assert.equal(
      (
        await req('/programmatic/transactions', {
          ...event,
          id: `${prefix}-future`,
          dealId: partner.data.id,
          source: 'partner',
          occurredAt: new Date(Date.now() + 86400000).toISOString(),
        })
      ).status,
      400,
    )
    assert.equal((await req(`/programmatic/deals/${partner.data.id}/simulate`, {})).status, 400)
    const capped = await req('/programmatic/deals', { ...body, budget: 100 })
    ids.deals.push(capped.data.id)
    assert.equal(
      (await req(`/programmatic/deals/${capped.data.id}/status`, { status: 'Active' })).status,
      200,
    )
    const concurrent = await Promise.all(
      [1, 2].map((n) =>
        req('/programmatic/transactions', {
          ...event,
          id: `${prefix}-concurrent-${n}`,
          dealId: capped.data.id,
          spend: 80,
          sspFee: 10,
          cost: 40,
        }),
      ),
    )
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409])
    const diagnostics = (await req('/programmatic/operations')).data
    assert.ok(diagnostics.some((i) => i.id === `forecast-${pg.data.id}`))
    const commercial = (await req(`/programmatic/commercial?month=${event.occurredAt.slice(0, 7)}`))
      .data
    const economics = commercial.deals.find((m) => m.deal.id === deal.data.id)
    assert.equal(economics.deal.paymentStatus, 'Paid')
    assert.equal(economics.revenue, 170)
    assert.equal(commercial.groups.dsp[prefix], 240)
    assert.equal(commercial.groups.dsp[`${prefix}-partner`], 170)
  } finally {
    await db.query('DELETE FROM programmatic_transactions WHERE deal_id = ANY($1::text[])', [
      ids.deals,
    ])
    await db.query('DELETE FROM programmatic_records WHERE id = ANY($1::text[])', [
      ids.deals.concat(ids.screens.map((id) => `profile-${id}`)),
    ])
    await db.query('DELETE FROM screens WHERE id = ANY($1::text[])', [ids.screens])
    await db.query('DELETE FROM inventory WHERE id=$1', [prefix])
    await db.end()
  }
})
