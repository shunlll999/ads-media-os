import { Body, Controller, Delete, Get, Module, Param, Put, Req } from '@nestjs/common'
import { z } from 'zod'
import type { AuthRequest } from '../auth/auth.controller.js'
import { AuthService } from '../auth/auth.service.js'
import { fail } from '../common/contracts.js'
import { GatewayStore, json, record } from '../database/gateway-store.service.js'
import { creativeSchema, id, screenSchema } from '../domain.js'
import { settingSchemas } from './settings.js'

const keys = [
  'overview',
  'areaPhotos',
  'planning',
  'analytics',
  'programmatic',
  'importTemplate',
] as const
const safePayload = z
  .record(z.string().max(100), z.unknown())
  .refine((v) => JSON.stringify(v).length < 150000, 'Payload too large.')
@Controller('v1/cms')
export class CmsController {
  constructor(
    private readonly store: GatewayStore,
    private readonly auth: AuthService,
  ) {}
  @Get('settings') async settings() {
    const rows = await this.store.database.client.workspaceSetting.findMany({
      where: { key: { in: [...keys] } },
    })
    return { data: Object.fromEntries(rows.map((r) => [r.key, r.payload])) }
  }
  @Put('settings/:key') async setting(
    @Param('key') key: string,
    @Body() b: unknown,
    @Req() r: AuthRequest,
  ) {
    z.enum(keys).parse(key)
    const payload = settingSchemas[key as keyof typeof settingSchemas].parse(b)
    await this.store.database.client.workspaceSetting.upsert({
      where: { key },
      create: { key, payload: json(payload) },
      update: { payload: json(payload) },
    })
    await this.auth.audit(r.user, 'setting.save', key)
    return payload
  }
  @Get('audit') async audit() {
    return {
      data: await this.store.database.client.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    }
  }
  @Get('draft') async draft(@Req() r: AuthRequest) {
    const row = await this.store.database.client.userDraft.findUnique({
      where: { userId_key: { userId: r.user.id, key: 'campaign' } },
    })
    return { data: row?.payload ?? null }
  }
  @Put('draft') async saveDraft(@Body() b: unknown, @Req() r: AuthRequest) {
    const payload = z
      .object({
        name: z.string().max(120).optional(),
        budget: z.number().finite().nonnegative().max(1e12).optional(),
        objective: z.string().max(500).optional(),
        audience: z.string().max(500).optional(),
        startDate: z.union([z.iso.date(), z.literal('')]).optional(),
        endDate: z.union([z.iso.date(), z.literal('')]).optional(),
        creativeId: z.string().max(100).optional(),
        creativeName: z.string().max(500).optional(),
        sourceProjectId: z.string().max(100).optional(),
        selectedInventory: z.array(id).max(200).optional(),
        plan: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .parse(safePayload.parse(b))
    return this.store.database.client.userDraft.upsert({
      where: { userId_key: { userId: r.user.id, key: 'campaign' } },
      create: { userId: r.user.id, key: 'campaign', payload: json(payload) },
      update: { payload: json(payload) },
    })
  }
  @Get('records/:kind') async records(@Param('kind') kind: string) {
    if (['projects', 'inventory', 'creatives', 'campaigns'].includes(kind))
      return { data: await this.store.rows(kind as 'projects') }
    if (kind === 'screens')
      return {
        data: (await this.store.database.client.screen.findMany())
          .map((s) => record(s.payload))
          .filter((s) => !s.archivedAt),
      }
    fail('Unknown CMS collection.', 404)
  }
  @Put('records/:kind/:id') async save(
    @Param('kind') kind: string,
    @Param('id') identity: string,
    @Body() b: unknown,
    @Req() r: AuthRequest,
  ) {
    id.parse(identity)
    const body = safePayload.parse(b)
    let result: unknown
    if (kind === 'projects') result = await this.store.upsertProject({ ...body, id: identity })
    else if (kind === 'inventory')
      result = await this.store.upsertInventory({ ...body, id: identity })
    else if (kind === 'creatives') {
      const cr = creativeSchema.parse(body)
      const existing = await this.store.database.client.creative.findUnique({
        where: { id: identity },
      })
      if (existing && record(existing.payload).archivedAt) fail('Creative has been removed.', 409)
      if (cr.projectId && !(await this.store.one('projects', cr.projectId)))
        fail('Project not found.', 404)
      const data = {
        projectId: cr.projectId ?? null,
        kind: cr.kind,
        payload: json({
          ...record(existing?.payload ?? {}),
          ...cr,
          id: identity,
          createdAt: existing ? record(existing.payload).createdAt : new Date().toISOString(),
        }),
      }
      await this.store.database.client.creative.upsert({
        where: { id: identity },
        create: { id: identity, ...data },
        update: data,
      })
      result = { ...cr, id: identity }
    } else if (kind === 'screens') {
      const screen = screenSchema.parse(body)
      const existing = await this.store.database.client.screen.findUnique({
        where: { id: identity },
      })
      if (existing && record(existing.payload).archivedAt) fail('Screen has been removed.', 409)
      if (!(await this.store.one('inventory', screen.inventoryId)))
        fail('Inventory not found.', 404)
      await this.store.database.client.screen.upsert({
        where: { id: identity },
        create: {
          id: identity,
          inventoryId: screen.inventoryId,
          payload: json({ ...screen, id: identity }),
        },
        update: { inventoryId: screen.inventoryId, payload: json({ ...screen, id: identity }) },
      })
      result = { ...screen, id: identity }
    } else fail('Manage campaign state through the campaign workflow.', 400)
    await this.auth.audit(r.user, 'cms.save', `${kind}/${identity}`)
    return result
  }
  @Delete('records/:kind/:id') async remove(
    @Param('kind') kind: string,
    @Param('id') identity: string,
    @Req() r: AuthRequest,
  ) {
    id.parse(identity)
    let archived = false
    await this.store.database.transaction(async (tx) => {
      if (kind === 'inventory' || kind === 'projects') {
        const deals = await tx.programmaticRecord.findMany({
          where:
            kind === 'inventory'
              ? { kind: 'deal', payload: { path: ['inventoryIds'], array_contains: [identity] } }
              : { kind: 'deal', payload: { path: ['projectId'], equals: identity } },
        })
        const sources = await tx.programmaticRecord.findMany({
          where:
            kind === 'inventory'
              ? {
                  kind: 'workspace-audience',
                  payload: { path: ['inventoryIds'], array_contains: [identity] },
                }
              : { kind: 'workspace-sources', payload: { path: ['projectId'], equals: identity } },
        })
        if (sources.length)
          fail(
            'Record is referenced by an audience segment or data source. Remove those references first.',
            409,
          )
        if (deals.some((d) => !record(d.payload).archivedAt))
          fail('Record is referenced by a deal. Remove that deal first.', 409)
        if (kind === 'inventory') {
          const inventory = await tx.inventory.findUnique({ where: { id: identity } })
          if (!inventory || record(inventory.payload).archivedAt) fail('Inventory not found.', 404)
          const screens = await tx.screen.findMany({ where: { inventoryId: identity } })
          const links = await tx.campaignInventory.findMany({
            where: { inventoryId: identity },
            include: { campaign: true },
          })
          if (screens.some((screen) => !record(screen.payload).archivedAt))
            fail('Remove the screens using this inventory first.', 409)
          if (
            links.some(
              (link) =>
                !record(link.campaign.payload).archivedAt && link.campaign.status !== 'Completed',
            )
          )
            fail('Complete or remove campaigns using this inventory first.', 409)
          archived = screens.length > 0 || links.length > 0 || deals.length > 0
        } else {
          const project = await tx.project.findUnique({ where: { id: identity } })
          if (!project || record(project.payload).archivedAt) fail('Project not found.', 404)
          const creatives = await tx.creative.findMany({ where: { projectId: identity } })
          const campaigns = await tx.campaign.findMany({ where: { sourceProjectId: identity } })
          if (creatives.some((creative) => !record(creative.payload).archivedAt))
            fail('Remove the creatives using this project first.', 409)
          if (
            campaigns.some(
              (campaign) => !record(campaign.payload).archivedAt && campaign.status !== 'Completed',
            )
          )
            fail('Complete or remove campaigns using this project first.', 409)
          archived = creatives.length > 0 || campaigns.length > 0 || deals.length > 0
        }
      }
      if (kind === 'creatives') {
        const creative = await tx.creative.findUnique({ where: { id: identity } })
        if (!creative || record(creative.payload).archivedAt) fail('Creative not found.', 404)
        const campaigns = await tx.campaign.findMany({ where: { creativeId: identity } })
        if (campaigns.some((c) => !record(c.payload).archivedAt && c.status !== 'Completed'))
          fail('Creative is used by a campaign. Complete or remove that campaign first.', 409)
        await tx.playlistItem.deleteMany({ where: { creativeId: identity } })
        archived =
          campaigns.length > 0 ||
          (await tx.playbackSession.count({ where: { creativeId: identity } })) > 0
      }
      if (kind === 'screens') {
        const screen = await tx.screen.findUnique({ where: { id: identity } })
        if (!screen || record(screen.payload).archivedAt) fail('Screen not found.', 404)
        if (screen.lastSeenAt && Date.now() - screen.lastSeenAt.getTime() < 45000)
          fail('Screen is online. Close its player and wait 45 seconds before deleting.', 409)
        const profiles = await tx.programmaticRecord.findMany({
          where: { kind: 'profile', payload: { path: ['screenId'], equals: identity } },
        })
        if (profiles.some((p) => record(p.payload).enabled === true))
          fail('Screen is enabled for programmatic. Disable it in onboarding before deleting.', 409)
        archived = (await tx.playbackSession.count({ where: { screenId: identity } })) > 0
        if (
          await tx.playlistItem.count({ where: { screenId: identity, campaignId: { not: null } } })
        )
          fail(
            'Screen has a deployed campaign. Remove its campaign assignment before deleting.',
            409,
          )
        // An unused screen can own a disabled onboarding profile and a preview playlist.
        await tx.programmaticRecord.deleteMany({ where: { id: { in: profiles.map((p) => p.id) } } })
      }
      await tx.workspaceSetting.upsert({
        where: { key: 'seedTombstones' },
        create: { key: 'seedTombstones', payload: json({ [`${kind}/${identity}`]: true }) },
        update: {},
      })
      const row = await tx.workspaceSetting.findUniqueOrThrow({ where: { key: 'seedTombstones' } })
      await tx.workspaceSetting.update({
        where: { key: 'seedTombstones' },
        data: { payload: json({ ...record(row.payload), [`${kind}/${identity}`]: true }) },
      })
      if (kind === 'projects') {
        if (archived) {
          const row = await tx.project.findUniqueOrThrow({ where: { id: identity } })
          await tx.project.update({
            where: { id: identity },
            data: {
              payload: json({ ...record(row.payload), archivedAt: new Date().toISOString() }),
            },
          })
        } else await tx.project.delete({ where: { id: identity } })
      } else if (kind === 'inventory') {
        if (archived) {
          const row = await tx.inventory.findUniqueOrThrow({ where: { id: identity } })
          await tx.inventory.update({
            where: { id: identity },
            data: {
              payload: json({ ...record(row.payload), archivedAt: new Date().toISOString() }),
            },
          })
        } else await tx.inventory.delete({ where: { id: identity } })
      } else if (kind === 'creatives') {
        if (archived) {
          const creative = await tx.creative.findUniqueOrThrow({ where: { id: identity } })
          await tx.creative.update({
            where: { id: identity },
            data: {
              payload: json({ ...record(creative.payload), archivedAt: new Date().toISOString() }),
            },
          })
        } else await tx.creative.delete({ where: { id: identity } })
      } else if (kind === 'screens') {
        if (archived) {
          const screen = await tx.screen.findUniqueOrThrow({ where: { id: identity } })
          await tx.playlistItem.deleteMany({ where: { screenId: identity } })
          await tx.screen.update({
            where: { id: identity },
            data: {
              tokenHash: null,
              lastSeenAt: null,
              payload: json({ ...record(screen.payload), archivedAt: new Date().toISOString() }),
            },
          })
        } else await tx.screen.delete({ where: { id: identity } })
      } else fail('Delete is not supported for this collection.', 400)
    })
    await this.auth.audit(r.user, archived ? 'cms.archive' : 'cms.delete', `${kind}/${identity}`)
    return { ok: true, archived }
  }
}
@Module({ controllers: [CmsController] })
export class CmsModule {}
