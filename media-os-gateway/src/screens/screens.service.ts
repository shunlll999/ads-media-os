import { randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { z } from 'zod'
import { fail } from '../common/contracts.js'
import { hash } from '../common/security.js'
import { GatewayStore, json, record } from '../database/gateway-store.service.js'
import { id, screenSchema } from '../domain.js'
@Injectable()
export class ScreensService {
  constructor(private readonly store: GatewayStore) {}
  async listScreens() {
    const data = await this.store.database.client.screen.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, payload: true },
    })
    return {
      data: await Promise.all(
        data.filter((r) => !record(r.payload).archivedAt).map((r) => this.store.screenById(r.id)),
      ),
    }
  }
  async registerScreen(body: unknown) {
    const s = screenSchema.parse(body)
    if (!(await this.store.one('inventory', s.inventoryId))) fail('Placement not found.', 404)
    const result = { ...s, id: `screen-${crypto.randomUUID()}` }
    await this.store.database.client.screen.create({
      data: { id: result.id, inventoryId: s.inventoryId, payload: json(result) },
    })
    return result
  }
  async updateScreen(body: unknown, identity: string) {
    const s = screenSchema.parse(body)
    if (!(await this.store.screenById(identity))) fail('Screen not found.', 404)
    if (!(await this.store.one('inventory', s.inventoryId))) fail('Placement not found.', 404)
    const result = { ...s, id: identity }
    await this.store.database.transaction(async (c) => {
      await c.playlistItem.deleteMany({ where: { screenId: result.id } })
      const profile = await c.programmaticRecord.findUnique({
        where: { id: `profile-${identity}` },
      })
      if (profile)
        await c.programmaticRecord.update({
          where: { id: profile.id },
          data: {
            payload: json({ ...record(profile.payload), enabled: false, testStatus: 'Untested' }),
          },
        })
      await c.screen.update({
        where: { id: result.id },
        data: { inventoryId: s.inventoryId, payload: json(result) },
      })
    })
    return result
  }
  async pairScreen(identity: string) {
    if (!(await this.store.screenById(identity))) fail('Screen not found.', 404)
    const token = randomBytes(32).toString('hex')
    const result = await this.store.database.client.screen.updateMany({
      where: { id: identity },
      data: { tokenHash: hash(token) },
    })
    if (!result.count) fail('Screen not found.', 404)
    return { screenId: identity, token }
  }
  async getPlaylist(identity: string) {
    return {
      data: await this.store.database.client.playlistItem.findMany({
        where: { screenId: identity },
        orderBy: { position: 'asc' },
        select: { creativeId: true, campaignId: true },
      }),
    }
  }
  async replacePlaylist(input: unknown, identity: string) {
    const body = z.object({ creativeIds: z.array(id).max(50) }).parse(input)
    await this.store.database.transaction(async (c) => {
      const s = await this.store.screenById(identity, c)
      if (!s) fail('Screen not found.', 404)
      if (!s.preview)
        fail('Direct playlists require preview mode. Deploy a launched campaign for live mode.')
      const unique = [...new Set(body.creativeIds)]
      if ((await c.creative.count({ where: { id: { in: unique } } })) !== unique.length)
        fail('Unknown creative.')
      await c.playlistItem.deleteMany({ where: { screenId: s.id } })
      await c.playlistItem.createMany({
        data: unique.map((creativeId, position) => ({ screenId: s.id, creativeId, position })),
      })
    })
    return { ok: true }
  }
  async deployCampaign(input: unknown) {
    const body = z.object({ campaignId: id, screenIds: z.array(id).min(1).max(100) }).parse(input)
    await this.store.database.transaction(async (c) => {
      const campaign = await this.store.campaignById(body.campaignId, c)
      if (campaign?.status !== 'Live') fail('Launch the campaign before deploying.', 409)
      if (!campaign.creativeId) fail('Campaign has no playable creative.')
      for (const sid of [...new Set(body.screenIds)]) {
        const s = await this.store.screenById(sid, c)
        if (!s) fail('Screen not found.', 404)
        if (!campaign.inventoryIds.includes(s.inventoryId))
          fail(`Screen ${s.name} is not in the campaign's selected inventory.`)
        await c.playlistItem.deleteMany({ where: { screenId: sid } })
        await c.playlistItem.create({
          data: {
            screenId: sid,
            creativeId: campaign.creativeId,
            campaignId: campaign.id,
            position: 0,
          },
        })
      }
    })
    return { ok: true }
  }
}
