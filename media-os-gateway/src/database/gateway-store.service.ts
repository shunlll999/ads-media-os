import { readFile } from 'node:fs/promises'
import { Injectable, OnApplicationBootstrap } from '@nestjs/common'
import { fail, type StoredRecord } from '../common/contracts.js'
import { creativeSchema, inventorySchema, projectSchema } from '../domain.js'
import type { Prisma } from '../generated/prisma/client.js'
import { DatabaseService, type Queryable, type Table } from './database.service.js'
export const json = (value: unknown) => value as Prisma.InputJsonValue
export const record = (value: Prisma.JsonValue) => value as StoredRecord
export const date = (value: string) => new Date(`${value}T00:00:00.000Z`)
@Injectable()
export class GatewayStore implements OnApplicationBootstrap {
  constructor(readonly database: DatabaseService) {}
  async rows(table: 'inventory', c?: Queryable): Promise<ReturnType<typeof inventorySchema.parse>[]>
  async rows(table: Table, c?: Queryable): Promise<StoredRecord[]>
  async rows(table: Table, c: Queryable = this.database.client): Promise<StoredRecord[]> {
    const args = { orderBy: { id: 'asc' as const }, select: { payload: true } }
    const rows =
      table === 'projects'
        ? await c.project.findMany(args)
        : table === 'inventory'
          ? await c.inventory.findMany(args)
          : table === 'creatives'
            ? await c.creative.findMany(args)
            : await c.campaign.findMany(args)
    return rows.map((r) => record(r.payload)).filter((r) => !r.archivedAt)
  }
  async one(table: Table, identity: string, c: Queryable = this.database.client) {
    const args = { where: { id: identity }, select: { payload: true } }
    const row =
      table === 'projects'
        ? await c.project.findUnique(args)
        : table === 'inventory'
          ? await c.inventory.findUnique(args)
          : table === 'creatives'
            ? await c.creative.findUnique(args)
            : await c.campaign.findUnique(args)
    return row && !record(row.payload).archivedAt ? record(row.payload) : undefined
  }
  async upsertProject(input: unknown, c: Queryable = this.database.client) {
    const p = projectSchema.parse(input)
    const previous = await c.project.findUnique({ where: { id: p.id } })
    if (previous && record(previous.payload).archivedAt) fail('Project has been removed.', 409)
    await c.project.upsert({
      where: { id: p.id },
      create: { id: p.id, payload: json(p) },
      update: { payload: json(p), updatedAt: new Date() },
    })
    return p
  }
  async upsertInventory(input: unknown, c: Queryable = this.database.client) {
    const i = inventorySchema.parse(input)
    const previous = await c.inventory.findUnique({ where: { id: i.id } })
    if (previous && record(previous.payload).archivedAt) fail('Inventory has been removed.', 409)
    const data = {
      area: i.area,
      price: i.price,
      availableFrom: date(i.availableFrom),
      availableTo: date(i.availableTo),
      payload: json(i),
    }
    await c.inventory.upsert({ where: { id: i.id }, create: { id: i.id, ...data }, update: data })
    return i
  }
  async createCreative(
    input: unknown,
    c: Queryable = this.database.client,
    identity = `creative-${crypto.randomUUID()}`,
  ) {
    const v = creativeSchema.parse(input)
    if (v.projectId && !(await this.one('projects', v.projectId, c)))
      fail('Source project not found.', 404)
    const result = { ...v, id: identity, createdAt: new Date().toISOString() }
    await c.creative.createMany({
      data: [{ id: identity, projectId: v.projectId ?? null, kind: v.kind, payload: json(result) }],
      skipDuplicates: true,
    })
    return result
  }
  async campaignById(identity: string, c: Queryable = this.database.client) {
    return this.one('campaigns', identity, c)
  }
  async screenById(
    identity: string,
    c: Queryable = this.database.client,
  ): Promise<StoredRecord | null> {
    const r = await c.screen.findUnique({ where: { id: identity } })
    return r && !record(r.payload).archivedAt
      ? {
          ...record(r.payload),
          lastSeenAt: r.lastSeenAt,
          online: Boolean(r.lastSeenAt && Date.now() - r.lastSeenAt.getTime() < 45000),
        }
      : null
  }
  async playlist(screen: StoredRecord): Promise<StoredRecord[]> {
    const rows = await this.database.client.playlistItem.findMany({
      where: { screenId: screen.id },
      orderBy: { position: 'asc' },
      include: { creative: { include: { project: true } }, campaign: true },
    })
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
    return rows
      .filter(
        (r) =>
          r.creative &&
          (r.campaignId
            ? r.campaign?.status === 'Live' &&
              (screen.preview ||
                (r.campaign.startDate.toISOString().slice(0, 10) <= today &&
                  r.campaign.endDate.toISOString().slice(0, 10) >= today))
            : screen.preview),
      )
      .flatMap((r) =>
        r.creative
          ? [
              {
                ...record(r.creative.payload),
                project: r.creative.project ? record(r.creative.project.payload) : null,
                campaignId: r.campaignId,
                mode: screen.preview ? 'preview' : 'live',
              },
            ]
          : [],
      )
  }
  async onApplicationBootstrap() {
    await this.database.transaction(async (c) => {
      // Serialize seed checks across Cloud Run instances; schema changes belong to Prisma Migrate.
      await c.$queryRaw`SELECT pg_advisory_xact_lock(804026)::text`
      const settings = JSON.parse(
        await readFile(new URL('../../data/settings.json', import.meta.url), 'utf8'),
      )
      for (const [key, payload] of Object.entries(settings)) {
        const existing =
          key === 'planning' ? await c.workspaceSetting.findUnique({ where: { key } }) : null
        await c.workspaceSetting.upsert({
          where: { key },
          create: { key, payload: json(payload) },
          update: existing
            ? { payload: json({ ...(payload as object), ...record(existing.payload) }) }
            : {},
        })
      }
      if (process.env.SEED_DEMO === 'false') return
      const tombstones = await c.workspaceSetting.findUnique({ where: { key: 'seedTombstones' } })
      const removed = tombstones ? record(tombstones.payload) : {}
      const seed = JSON.parse(
        await readFile(new URL('../../data/seed.json', import.meta.url), 'utf8').catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error
            return readFile(new URL('../../data/seed.example.json', import.meta.url), 'utf8')
          },
        ),
      )
      for (const p of seed.projects)
        if (!removed[`projects/${p.id}`] && !(await this.one('projects', p.id, c)))
          await this.upsertProject(p, c)
      for (const i of seed.inventory)
        if (!removed[`inventory/${i.id}`] && !(await this.one('inventory', i.id, c)))
          await this.upsertInventory(i, c)
      for (const cr of seed.creatives)
        if (!removed[`creatives/${cr.id}`] && !(await this.one('creatives', cr.id, c)))
          await this.createCreative(cr, c, cr.id)
      for (const screen of seed.screens ?? []) {
        if (removed[`screens/${screen.id}`] || (await this.screenById(screen.id, c))) continue
        await c.screen.create({
          data: { id: screen.id, inventoryId: screen.inventoryId, payload: json(screen) },
        })
        await c.playlistItem.create({
          data: {
            screenId: screen.id,
            creativeId:
              seed.creatives.find((cr: { kind: string }) => cr.kind === 'project')?.id ??
              seed.creatives[0].id,
            position: 0,
          },
        })
      }
      for (const campaign of seed.campaigns) {
        if (
          removed[`campaigns/${campaign.id}`] ||
          (await c.campaign.findUnique({ where: { id: campaign.id } }))
        )
          continue
        const v = {
          ...campaign,
          creativeId: campaign.creativeId ?? 'demo-creative',
          startDate: campaign.startDate ?? '2026-11-01',
          endDate: campaign.endDate ?? '2026-11-30',
        }
        await c.campaign.create({
          data: {
            id: v.id,
            sourceProjectId: v.sourceProjectId ?? null,
            creativeId: v.creativeId,
            status: v.status,
            startDate: date(v.startDate),
            endDate: date(v.endDate),
            payload: json(v),
          },
        })
        await c.campaignInventory.createMany({
          data: v.inventoryIds.map((inventoryId: string) => ({ campaignId: v.id, inventoryId })),
        })
      }
    })
  }
}
