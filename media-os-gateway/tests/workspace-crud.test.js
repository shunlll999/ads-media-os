import assert from 'node:assert/strict'
import test from 'node:test'
import pg from 'pg'
import { loginAdmin } from './auth-helpers.js'

const base = process.env.GATEWAY_TEST_URL ?? 'http://127.0.0.1:4000'
test('workspace CRUD and deal/transaction lifecycle complete an isolated E2E loop', async () => {
  const headers = await loginAdmin(),
    db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const prefix = `crudqa-${crypto.randomUUID()}`,
    records = [],
    deals = [],
    owned = {}
  const request = async (path, method = 'GET', body, expected = 200) => {
    const r = await fetch(`${base}/v1${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const data = await r.json()
    assert.equal(r.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
    return data
  }
  const placement = {
    id: prefix,
    name: prefix,
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
    await request('/media', 'POST', placement, 201)
    const project = {
      id: `${prefix}-project`,
      name: prefix,
      category: 'QA',
      url: 'https://example.com',
      image: '/assets/demo-launch.svg',
      description: 'Isolated QA project',
      capabilities: ['QA'],
      publicStatus: 'Demo',
      reviewedAt: '2026-10-09',
      suggestedBrief: { name: prefix, objective: 'Product Launch', audience: 'QA' },
    }
    await request('/projects', 'POST', project, 201)
    owned.project = project.id
    await request(`/cms/records/projects/${project.id}`, 'PUT', {
      ...project,
      description: 'Updated QA project',
    })
    const creativeBody = {
      name: prefix,
      kind: 'project',
      projectId: project.id,
      durationSeconds: 15,
      fit: 'contain',
    }
    const creative = await request('/creatives', 'POST', creativeBody, 201)
    owned.creative = creative.id
    await request(`/cms/records/creatives/${creative.id}`, 'PUT', {
      ...creativeBody,
      name: `${prefix} edited`,
    })
    const campaignBody = {
      name: prefix,
      objective: 'Product Launch',
      budget: 1000000,
      inventoryIds: [prefix],
      creativeId: creative.id,
      sourceProjectId: project.id,
      startDate: '2026-10-09',
      endDate: '2026-10-09',
    }
    const campaign = await request('/campaigns', 'POST', campaignBody, 201)
    owned.campaign = campaign.id
    await request(`/campaigns/${campaign.id}`, 'PATCH', {
      ...campaignBody,
      name: `${prefix} edited`,
    })
    await request(`/cms/records/creatives/${creative.id}`, 'DELETE', {}, 409)
    await request(`/campaigns/${campaign.id}/status`, 'POST', { status: 'Approved' })
    await request(`/campaigns/${campaign.id}/status`, 'POST', { status: 'Live' })
    await request(`/campaigns/${campaign.id}`, 'DELETE', {}, 409)
    await request(`/campaigns/${campaign.id}/status`, 'POST', { status: 'Completed' })

    await request(`/cms/records/inventory/${prefix}`, 'PUT', {
      ...placement,
      name: `${prefix} updated`,
    })
    const connection = await request(
      '/programmatic/connections',
      'POST',
      { name: prefix, mode: 'mock', node: 'DSP' },
      201,
    )
    records.push(connection.id)
    await request(`/programmatic/connections/${connection.id}`, 'PATCH', {
      name: prefix,
      mode: 'mock',
      node: 'DSP',
      notes: 'updated',
    })
    await request('/programmatic/connections/sync', 'POST', { name: prefix })
    await request('/programmatic/connections/disconnect', 'POST', { name: prefix })
    const body = {
      name: prefix,
      type: 'PMP',
      source: 'mock',
      dsp: prefix,
      ssp: prefix,
      inventoryIds: [prefix],
      cpm: 200,
      floorCpm: 100,
      budget: 100000,
      startDate: '2026-01-01',
      endDate: '2027-12-31',
      impressionTarget: 10000,
    }
    const deal = await request('/programmatic/deals', 'POST', body, 201)
    deals.push(deal.id)
    await request(`/programmatic/deals/${deal.id}`, 'PATCH', { ...body, name: `${prefix} updated` })
    for (const [kind, value] of [
      [
        'audience',
        {
          name: prefix,
          inventoryIds: [prefix],
          description: 'QA segment',
          estimatedAudience: 100,
          dataSource: 'mock',
        },
      ],
      ['sources', { name: prefix, url: 'https://example.com', status: 'Draft', notes: '' }],
      [
        'issues',
        {
          name: prefix,
          severity: 'Warning',
          status: 'Open',
          action: 'Investigate',
          href: '/operations',
        },
      ],
      ['reports', { name: prefix, month: '2026-10', notes: '' }],
    ]) {
      const row = await request(`/workspace/${kind}`, 'POST', value, 201)
      records.push(row.id)
      const list = await request(`/workspace/${kind}`)
      assert(list.data.some((r) => r.id === row.id))
      const updated = await request(`/workspace/${kind}/${row.id}`, 'PATCH', {
        ...value,
        name: `${prefix} edited`,
      })
      assert.equal(updated.name, `${prefix} edited`)
      await request(`/workspace/${kind}/${row.id}`, 'DELETE')
      assert(!(await request(`/workspace/${kind}`)).data.some((r) => r.id === row.id))
    }
    const proposalBody = {
      name: prefix,
      dealId: deal.id,
      amount: 100000,
      reference: prefix,
      stage: 'Proposal',
    }
    const proposal = await request('/workspace/proposals', 'POST', proposalBody, 201)
    records.push(proposal.id)
    await request(`/workspace/proposals/${proposal.id}`, 'PATCH', {
      ...proposalBody,
      stage: 'Quotation',
    })
    // Activation requires tested, enabled inventory onboarding; create only owned fixtures.
    const screen = await request(
      '/screens',
      'POST',
      {
        name: prefix,
        inventoryId: prefix,
        location: 'Bangkok',
        latitude: 13.7,
        longitude: 100.5,
        format: 'landscape',
        width: 1920,
        height: 1080,
        preview: true,
      },
      201,
    )
    records.push(`profile-${screen.id}`)
    owned.screen = screen.id
    await db.query(
      'INSERT INTO playback_sessions(id,screen_id,creative_id,campaign_id,mode) VALUES($1,$2,$3,$4,$5)',
      [crypto.randomUUID(), screen.id, owned.creative, owned.campaign, 'preview'],
    )

    await request(`/programmatic/screens/${screen.id}/profile`, 'POST', {
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
    })
    await request(`/programmatic/screens/${screen.id}/test`, 'POST', {})
    await request(`/programmatic/screens/${screen.id}/enable`, 'POST', { enabled: true })
    await request(`/programmatic/deals/${deal.id}/status`, 'POST', { status: 'Active' })
    await request(`/programmatic/deals/${deal.id}`, 'DELETE', {}, 409)
    await request(`/workspace/proposals/${proposal.id}`, 'PATCH', {
      ...proposalBody,
      stage: 'Campaign',
    })
    const invoiceBody = { ...proposalBody, stage: 'Invoice', reference: `${prefix}-invoice` }
    const invoice = await request('/workspace/invoices', 'POST', invoiceBody, 201)
    records.push(invoice.id)
    await request(`/workspace/invoices/${invoice.id}`, 'PATCH', { ...invoiceBody, stage: 'Paid' })
    const event = {
      id: `${prefix}-tx`,
      dealId: deal.id,
      inventoryId: prefix,
      occurredAt: '2026-10-09T12:00:00Z',
      source: 'mock',
      impressions: 1000,
      requests: 2000,
      bids: 1000,
      wins: 500,
      spend: 200,
      sspFee: 30,
      cost: 50,
    }
    await request('/programmatic/transactions', 'POST', event)
    await request(
      `/programmatic/transactions/${event.id}`,
      'PATCH',
      { ...event, impressions: 1200 },
      409,
    )
    await request(`/programmatic/deals/${deal.id}/status`, 'POST', { status: 'Paused' })
    await request(`/programmatic/transactions/${event.id}`, 'PATCH', {
      ...event,
      impressions: 1200,
    })
    await request(`/programmatic/transactions/${event.id}`, 'DELETE')
    await request(`/workspace/invoices/${invoice.id}`, 'DELETE')
    await request(`/workspace/proposals/${proposal.id}`, 'DELETE')
    await request(`/programmatic/deals/${deal.id}`, 'DELETE')
    assert(!(await request('/programmatic/deals')).some((r) => r.id === deal.id))
    const partnerDeal = await request(
      '/programmatic/deals',
      'POST',
      { ...body, source: 'partner' },
      201,
    )
    deals.push(partnerDeal.id)
    await request(`/programmatic/deals/${partnerDeal.id}/status`, 'POST', { status: 'Active' })
    const partnerEvent = {
      ...event,
      id: `${prefix}-partner-tx`,
      dealId: partnerDeal.id,
      source: 'partner',
      occurredAt: new Date().toISOString(),
    }
    await request('/programmatic/transactions', 'POST', partnerEvent)
    await request(`/programmatic/deals/${partnerDeal.id}/status`, 'POST', { status: 'Paused' })
    await request(`/programmatic/transactions/${partnerEvent.id}`, 'PATCH', partnerEvent, 409)
    await request(`/programmatic/transactions/${partnerEvent.id}`, 'DELETE', {}, 409)
    assert.equal((await request(`/programmatic/deals/${partnerDeal.id}`, 'DELETE')).archived, true)
    assert(!(await request('/programmatic/deals')).some((r) => r.id === partnerDeal.id))
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM programmatic_transactions WHERE deal_id=$1',
          [partnerDeal.id],
        )
      ).rows[0].n,
      1,
    )
    await request(`/programmatic/screens/${screen.id}/enable`, 'POST', { enabled: false })
    await request(`/programmatic/screens/${screen.id}/profile`, 'DELETE')
    assert.equal((await request(`/campaigns/${owned.campaign}`, 'DELETE')).archived, true)
    assert.equal((await request(`/cms/records/screens/${screen.id}`, 'DELETE')).archived, true)
    assert.equal(
      (await request(`/cms/records/creatives/${owned.creative}`, 'DELETE')).archived,
      true,
    )
    assert.equal((await request(`/cms/records/projects/${owned.project}`, 'DELETE')).archived, true)
    await request(`/programmatic/connections/${connection.id}`, 'DELETE')
    assert.equal((await request(`/cms/records/inventory/${prefix}`, 'DELETE')).archived, true)
    await request('/media', 'POST', placement, 409)
    await request('/programmatic/deals', 'POST', body, 400)
  } finally {
    await db.query('DELETE FROM programmatic_transactions WHERE deal_id=ANY($1::text[])', [deals])
    await db.query(
      "DELETE FROM programmatic_records WHERE id=ANY($1::text[]) OR payload->>'name' LIKE $2",
      [...[records.concat(deals), `${prefix}%`]],
    )
    if (owned.screen)
      await db.query('DELETE FROM playback_sessions WHERE screen_id=$1', [owned.screen])
    await db.query("DELETE FROM screens WHERE payload->>'name' LIKE $1", [`${prefix}%`])
    if (owned.campaign) await db.query('DELETE FROM campaigns WHERE id=$1', [owned.campaign])
    if (owned.creative) await db.query('DELETE FROM creatives WHERE id=$1', [owned.creative])
    if (owned.project) await db.query('DELETE FROM projects WHERE id=$1', [owned.project])
    await db.query('DELETE FROM inventory WHERE id=$1', [prefix])
    await db.query(
      "UPDATE workspace_settings SET payload=(SELECT COALESCE(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(payload) WHERE key NOT LIKE $1) WHERE key='seedTombstones'",
      [`%${prefix}%`],
    )
    await db.end()
  }
})
