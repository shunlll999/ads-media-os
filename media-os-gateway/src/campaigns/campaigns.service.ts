import { Injectable } from '@nestjs/common'
import { z } from 'zod'
import { fail } from '../common/contracts.js'
import { date, GatewayStore, json, record } from '../database/gateway-store.service.js'
import { campaignSchema, cost, days, inventorySchema } from '../domain.js'
@Injectable()
export class CampaignsService {
  constructor(private readonly store: GatewayStore) {}
  async listCampaigns() {
    return {
      data: (await this.store.rows('campaigns')).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
      meta: { source: 'postgresql' },
    }
  }
  async createCampaign(body: unknown) {
    const b = campaignSchema.parse(body)
    const result = await this.store.database.transaction(async (c) => {
      const ids = [...new Set(b.inventoryIds)]
      // Preserve placement locks while validating dates and spend in the transaction.
      const rows = await c.$queryRaw<
        { payload: import('../generated/prisma/client.js').Prisma.JsonValue }[]
      >`SELECT payload FROM inventory WHERE id = ANY(${ids}::text[]) FOR SHARE`
      const items = rows
        .filter((r) => !record(r.payload).archivedAt)
        .map((r) => record(r.payload) as ReturnType<typeof inventorySchema.parse>)
      if (
        !days(b.startDate, b.endDate) ||
        items.length !== ids.length ||
        items.some((i) => i.availableFrom > b.startDate || i.availableTo < b.endDate)
      )
        fail('Selected placements are unavailable for this period.')
      if (b.sourceProjectId && !(await this.store.one('projects', b.sourceProjectId, c)))
        fail('Unknown source project.')
      const creative = b.creativeId
        ? await this.store.one('creatives', b.creativeId, c)
        : await this.store.one('creatives', 'demo-creative', c)
      if (!creative) fail('Choose a valid creative.')
      const spend = cost(items, b.startDate, b.endDate)
      if (spend > b.budget) fail('Planned spend exceeds the budget.')
      const result = {
        ...b,
        id: `campaign-${crypto.randomUUID()}`,
        inventoryIds: ids,
        creativeId: creative.id,
        creativeName: creative.name,
        spend,
        period: `${b.startDate} – ${b.endDate}`,
        reach: 'Not measured',
        frequency: 'Not measured',
        status: 'Pending Approval',
        createdAt: new Date().toISOString(),
      }
      await c.campaign.create({
        data: {
          id: result.id,
          sourceProjectId: b.sourceProjectId ?? null,
          creativeId: creative.id,
          status: result.status,
          startDate: date(b.startDate),
          endDate: date(b.endDate),
          payload: json(result),
        },
      })
      await c.campaignInventory.createMany({
        data: ids.map((inventoryId) => ({ campaignId: result.id, inventoryId })),
      })
      return result
    })
    return result
  }
  async getCampaign(identity: string) {
    const c = await this.store.campaignById(identity)
    if (!c) fail('Campaign not found.', 404)
    return c
  }
  async editCampaign(body: unknown, identity: string) {
    const b = campaignSchema.parse(body)
    return this.store.database.transaction(async (c) => {
      await c.$queryRaw`SELECT id FROM campaigns WHERE id=${identity} FOR UPDATE`
      const current = await this.store.campaignById(identity, c)
      if (!current) fail('Campaign not found.', 404)
      if (!['Planning', 'Pending Approval', 'Approved'].includes(current.status))
        fail('Live or completed campaigns cannot change their approved brief.', 409)
      const inventory = await this.store.rows('inventory', c),
        ids = [...new Set(b.inventoryIds)]
      const items = inventory.filter((i) => ids.includes(i.id))
      if (
        items.length !== ids.length ||
        items.some((i) => i.availableFrom > b.startDate || i.availableTo < b.endDate)
      )
        fail('Selected inventory is unavailable for this flight.')
      if (b.sourceProjectId && !(await this.store.one('projects', b.sourceProjectId, c)))
        fail('Unknown project.')
      const creative = await this.store.one('creatives', b.creativeId ?? '', c)
      if (!creative) fail('Choose a valid creative.')
      const spend = cost(items, b.startDate, b.endDate)
      if (spend > b.budget) fail('Planned spend exceeds budget.')
      const result = {
        ...current,
        ...b,
        inventoryIds: ids,
        creativeId: creative.id,
        creativeName: creative.name,
        spend,
        status: 'Pending Approval',
        period: `${b.startDate} – ${b.endDate}`,
      }
      await c.campaignInventory.deleteMany({ where: { campaignId: identity } })
      await c.campaign.update({
        where: { id: identity },
        data: {
          creativeId: creative.id,
          sourceProjectId: b.sourceProjectId ?? null,
          status: result.status,
          startDate: date(b.startDate),
          endDate: date(b.endDate),
          payload: json(result),
        },
      })
      await c.campaignInventory.createMany({
        data: ids.map((inventoryId) => ({ campaignId: identity, inventoryId })),
      })
      return result
    })
  }
  async removeCampaign(identity: string) {
    return this.store.database.transaction(async (c) => {
      await c.$queryRaw`SELECT id FROM campaigns WHERE id=${identity} FOR UPDATE`
      const campaign = await this.store.campaignById(identity, c)
      if (!campaign) fail('Campaign not found.', 404)
      if (campaign.status === 'Live') fail('Complete the campaign before removing it.', 409)
      const deals = (
        await c.programmaticRecord.findMany({
          where: { kind: 'deal', payload: { path: ['campaignId'], equals: identity } },
        })
      ).map((r) => record(r.payload))
      if (deals.some((d) => d.status === 'Active' && !d.archivedAt))
        fail('Pause the linked deal first.', 409)
      await c.playlistItem.deleteMany({ where: { campaignId: identity } })
      const archived =
        deals.length > 0 || (await c.playbackSession.count({ where: { campaignId: identity } })) > 0
      if (archived)
        await c.campaign.update({
          where: { id: identity },
          data: { payload: json({ ...campaign, archivedAt: new Date().toISOString() }) },
        })
      else await c.campaign.delete({ where: { id: identity } })
      const old = await c.workspaceSetting.findUnique({ where: { key: 'seedTombstones' } })
      await c.workspaceSetting.upsert({
        where: { key: 'seedTombstones' },
        create: { key: 'seedTombstones', payload: json({ [`campaigns/${identity}`]: true }) },
        update: {
          payload: json({ ...record(old?.payload ?? {}), [`campaigns/${identity}`]: true }),
        },
      })
      return { ok: true, archived }
    })
  }
  async updateStatus(body: unknown, identity: string) {
    const next = z
      .enum(['Approved', 'Live', 'Completed'])
      .parse((body as { status?: unknown }).status)
    const result = await this.store.database.transaction(async (c) => {
      const rows = await c.$queryRaw<
        { payload: import('../generated/prisma/client.js').Prisma.JsonValue }[]
      >`SELECT payload FROM campaigns WHERE id=${identity} FOR UPDATE`
      if (!rows[0] || record(rows[0].payload).archivedAt) fail('Campaign not found.', 404)
      const current = record(rows[0].payload)
      const transitions: Record<string, string> = {
        'Pending Approval': 'Approved',
        Approved: 'Live',
        Live: 'Completed',
      }
      if (transitions[current.status] !== next) fail('Invalid campaign state transition.', 409)
      const updated = { ...current, status: next }
      await c.campaign.update({
        where: { id: current.id },
        data: { status: next, payload: json(updated) },
      })
      return updated
    })
    return result
  }
  async analytics(identity: string) {
    const c = await this.store.campaignById(identity)
    if (!c) fail('Campaign not found.', 404)
    const db = this.store.database.client
    const mockSetting = await db.workspaceSetting.findUnique({ where: { key: 'analytics' } })
    const mock = mockSetting ? record(mockSetting.payload)[identity] : undefined
    if (mock && identity.startsWith('demo-'))
      return { ...mock, campaignId: identity, measurementSource: 'mock' }
    const [delivered, previews, started, grouped] = await Promise.all([
      db.playbackSession.count({
        where: { campaignId: c.id, mode: 'live', completedAt: { not: null } },
      }),
      db.playbackSession.count({
        where: { campaignId: c.id, mode: 'preview', completedAt: { not: null } },
      }),
      db.playbackSession.count({ where: { campaignId: c.id, mode: 'live' } }),
      db.$queryRaw<
        { area: string; plays: number }[]
      >`SELECT s.payload->>'location' AS area,count(*) FILTER(WHERE p.completed_at IS NOT NULL AND p.mode='live')::int AS plays FROM playback_sessions p JOIN screens s ON s.id=p.screen_id WHERE p.campaign_id=${c.id} GROUP BY s.payload->>'location'`,
    ])
    const metrics = { delivered, previews, started }
    return {
      campaignId: c.id,
      reach: 'Not measured',
      frequency: 'Not measured',
      proofOfPlay: metrics.started
        ? `${Math.round((metrics.delivered / metrics.started) * 1000) / 10}%`
        : '—',
      deliveredPlays: metrics.delivered,
      scheduledPlays: metrics.started,
      previewPlays: metrics.previews,
      storeVisits: 'Not connected',
      engagements: 'Not connected',
      roas: 'Not connected',
      topLocations: grouped.map((r) => ({
        area: r.area,
        impressions: `${r.plays} completed plays`,
        proofOfPlay: 'Browser telemetry',
      })),
      measurementSource: 'player',
      totalStarts: metrics.started,
    }
  }
}
