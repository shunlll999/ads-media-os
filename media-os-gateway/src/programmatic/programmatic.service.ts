import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { z } from 'zod'
import { fail } from '../common/contracts.js'
import { DatabaseService } from '../database/database.service.js'
import { json, record } from '../database/gateway-store.service.js'
import {
  type Deal,
  dealSchema,
  type Profile,
  profileSchema,
  transactionSchema,
} from './contracts.js'
import { MockSspAdapter } from './mock-ssp.adapter.js'

const round = (v: number) => Math.round(v * 100) / 100
const isoDay = (v: Date) => v.toISOString().slice(0, 10)
@Injectable()
export class ProgrammaticService {
  constructor(
    private readonly db: DatabaseService,
    private readonly adapter: MockSspAdapter,
  ) {}
  async records<T>(kind: string, includeArchived = false): Promise<T[]> {
    return (
      await this.db.client.programmaticRecord.findMany({ where: { kind }, orderBy: { id: 'asc' } })
    )
      .filter((v) => includeArchived || !record(v.payload).archivedAt)
      .map((v) => record(v.payload) as T)
  }
  async get<T>(id: string, kind: string): Promise<T> {
    const row = await this.db.client.programmaticRecord.findUnique({ where: { id } })
    if (row?.kind !== kind) fail(`${kind} not found.`, 404)
    return record(row.payload) as T
  }
  async save(id: string, kind: string, payload: unknown) {
    return this.db.client.programmaticRecord.upsert({
      where: { id },
      create: { id, kind, payload: json(payload) },
      update: { payload: json(payload) },
    })
  }
  async validateDeal(input: unknown) {
    const v = dealSchema.parse(input)
    const inventory = await this.db.client.inventory.findMany({
      where: { id: { in: v.inventoryIds } },
    })
    if (
      inventory.length !== v.inventoryIds.length ||
      inventory.some((i) => record(i.payload).archivedAt)
    )
      fail('Unknown inventory.')
    if (
      inventory.some(
        (i) => isoDay(i.availableFrom) > v.startDate || isoDay(i.availableTo) < v.endDate,
      )
    )
      fail('Inventory unavailable for this flight.')
    if (v.cpm < v.floorCpm) fail('CPM must meet Floor CPM.')
    if (v.type === 'PG' && (v.impressionTarget * v.cpm) / 1000 > v.budget)
      fail('PG budget cannot fund the impression guarantee.')
    if (v.projectId) {
      const project = await this.db.client.project.findUnique({ where: { id: v.projectId } })
      if (!project || record(project.payload).archivedAt) fail('Project not found.')
    }
    if (v.campaignId) {
      const campaign = await this.db.client.campaign.findUnique({ where: { id: v.campaignId } })
      if (!campaign || record(campaign.payload).archivedAt) fail('Campaign not found.')
    }
    return v
  }
  async createDeal(input: unknown) {
    const v = await this.validateDeal(input)
    const result: Deal = {
      ...v,
      id: `deal-${randomUUID()}`,
      status: 'Draft',
      stage: 'Proposal',
      paymentStatus: 'Unpaid',
    }
    await this.save(result.id, 'deal', result)
    return result
  }
  async updateDeal(identity: string, input: unknown) {
    const v = await this.validateDeal(input)
    return this.db.transaction(async (c) => {
      await c.$queryRaw`SELECT id FROM programmatic_records WHERE id=${identity} FOR UPDATE`
      const row = await c.programmaticRecord.findUnique({ where: { id: identity } })
      if (row?.kind !== 'deal' || record(row.payload).archivedAt) fail('Deal not found.', 404)
      const current = record(row.payload)
      if (!['Draft', 'Paused'].includes(current.status))
        fail('Pause the deal before editing; Completed deals are read-only.', 409)
      const total = await c.programmaticTransaction.aggregate({
        where: { dealId: identity },
        _sum: { spend: true },
        _count: true,
      })
      if (v.budget < Number(total._sum.spend ?? 0))
        fail('Budget cannot be lower than recorded spend.', 409)
      if (
        total._count &&
        [
          'source',
          'type',
          'dsp',
          'ssp',
          'inventoryIds',
          'projectId',
          'campaignId',
          'cpm',
          'floorCpm',
          'startDate',
          'endDate',
          'sspFeePercent',
        ].some((key) => JSON.stringify(current[key]) !== JSON.stringify(v[key as keyof typeof v]))
      )
        fail('Delivered deals can only change name, budget and impression target.', 409)
      const result = { ...current, ...v }
      await c.programmaticRecord.update({
        where: { id: identity },
        data: { payload: json(result) },
      })
      return result
    })
  }
  async removeDeal(identity: string) {
    return this.db.transaction(async (c) => {
      await c.$queryRaw`SELECT id FROM programmatic_records WHERE id=${identity} FOR UPDATE`
      const row = await c.programmaticRecord.findUnique({ where: { id: identity } })
      if (row?.kind !== 'deal' || record(row.payload).archivedAt) fail('Deal not found.', 404)
      const deal = record(row.payload)
      if (deal.status === 'Active') fail('Pause or complete the deal before removing it.', 409)
      const count = await c.programmaticTransaction.count({ where: { dealId: identity } })
      const archived = deal.source === 'partner' && count > 0
      if (archived)
        await c.programmaticRecord.update({
          where: { id: identity },
          data: { payload: json({ ...deal, archivedAt: new Date().toISOString() }) },
        })
      else {
        await c.programmaticRecord.deleteMany({
          where: {
            kind: { in: ['workspace-proposals', 'workspace-invoices'] },
            payload: { path: ['dealId'], equals: identity },
          },
        })
        await c.programmaticTransaction.deleteMany({ where: { dealId: identity } })
        await c.programmaticRecord.delete({ where: { id: identity } })
      }
      return { ok: true, archived }
    })
  }
  async editTransaction(identity: string, input: unknown) {
    const event = transactionSchema.parse(input)
    if (event.id !== identity) fail('Transaction ID cannot change.')
    return this.db.transaction(async (c) => {
      await c.$queryRaw`SELECT id FROM programmatic_records WHERE id=${event.dealId} FOR UPDATE`
      const prior = await c.programmaticTransaction.findUnique({ where: { id: identity } })
      if (!prior) fail('Transaction not found.', 404)
      if (prior.source !== 'mock' || event.source !== 'mock')
        fail('Partner transactions are append-only.', 409)
      if (prior.dealId !== event.dealId) fail('Transaction deal cannot change.')
      const row = await c.programmaticRecord.findUnique({ where: { id: event.dealId } })
      if (row?.kind !== 'deal' || record(row.payload).archivedAt) fail('Deal not found.', 404)
      const deal = record(row.payload)
      if (deal.status !== 'Paused') fail('Pause the deal before correcting mock transactions.', 409)
      if (
        !deal.inventoryIds.includes(event.inventoryId) ||
        isoDay(new Date(event.occurredAt)) < deal.startDate ||
        isoDay(new Date(event.occurredAt)) > deal.endDate
      )
        fail('Transaction is outside the deal inventory or flight.')
      const total = await c.programmaticTransaction.aggregate({
        where: { dealId: event.dealId },
        _sum: { spend: true },
      })
      if (Number(total._sum.spend ?? 0) - Number(prior.spend) + event.spend > deal.budget)
        fail('Transaction exceeds budget.', 409)
      return c.programmaticTransaction.update({
        where: { id: identity },
        data: { ...event, occurredAt: new Date(event.occurredAt) },
      })
    })
  }
  async removeTransaction(identity: string) {
    const prior = await this.db.client.programmaticTransaction.findUnique({
      where: { id: identity },
    })
    if (!prior) fail('Transaction not found.', 404)
    return this.db.transaction(async (c) => {
      await c.$queryRaw`SELECT id FROM programmatic_records WHERE id=${prior.dealId} FOR UPDATE`
      const deal = await c.programmaticRecord.findUnique({ where: { id: prior.dealId } })
      if (prior.source !== 'mock') fail('Partner transactions are append-only.', 409)
      if (!deal || record(deal.payload).status === 'Active')
        fail('Pause or complete the deal before removing mock transactions.', 409)
      await c.programmaticTransaction.delete({ where: { id: identity } })
      return { ok: true }
    })
  }
  async status(identity: string, input: unknown) {
    const { status } = z.object({ status: z.enum(['Active', 'Paused', 'Completed']) }).parse(input)
    return this.db.transaction(async (c) => {
      await c.$queryRaw`SELECT id FROM programmatic_records WHERE id = ${identity} FOR UPDATE`
      const row = await c.programmaticRecord.findUnique({ where: { id: identity } })
      if (row?.kind !== 'deal' || record(row.payload).archivedAt) fail('Deal not found.', 404)
      const deal = record(row.payload) as Deal
      const allowed: Record<string, string[]> = {
        Draft: ['Active'],
        Active: ['Paused', 'Completed'],
        Paused: ['Active', 'Completed'],
        Completed: [],
      }
      if (!allowed[deal.status]?.includes(status)) fail('Invalid deal status transition.', 409)
      if (status === 'Active') {
        const profiles = (await c.programmaticRecord.findMany({ where: { kind: 'profile' } })).map(
          (v) => record(v.payload) as Profile,
        )
        const screens = await c.screen.findMany({
          where: { inventoryId: { in: deal.inventoryIds } },
        })
        for (const inventoryId of deal.inventoryIds) {
          if (
            !screens.some(
              (s) =>
                s.inventoryId === inventoryId &&
                profiles.some(
                  (p) =>
                    p.screenId === s.id &&
                    p.enabled &&
                    p.testStatus === 'Passed' &&
                    p.ssp === deal.ssp &&
                    p.floorCpm <= deal.cpm,
                ),
            )
          )
            fail(
              'Every placement needs an enabled, tested screen on the selected SSP, with a compatible floor.',
              409,
            )
        }
        if (deal.type === 'PG') {
          const days = (Date.parse(deal.endDate) - Date.parse(deal.startDate)) / 86400000 + 1
          let capacity = 0
          for (const s of screens) {
            const p = profiles.find((p) => p.screenId === s.id && p.enabled && p.ssp === deal.ssp)
            if (!p) continue
            const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
            const hours =
              ((minutes(p.operatingEnd) - minutes(p.operatingStart) + 1440) % 1440 || 1440) / 60
            capacity += Math.floor((hours * 3600) / p.loopDuration) * days * p.audiencePerPlay
          }
          if (capacity < deal.impressionTarget)
            fail(`PG forecast insufficient inventory: ${capacity} modeled impressions.`, 409)
        }
      }
      const result = { ...deal, status }
      await c.programmaticRecord.update({
        where: { id: identity },
        data: { payload: json(result) },
      })
      return result
    })
  }
  async profiles() {
    const [screens, profiles] = await Promise.all([
      this.db.client.screen.findMany({ orderBy: { id: 'asc' } }),
      this.records<Profile>('profile'),
    ])
    return screens
      .filter((s) => !record(s.payload).archivedAt)
      .map((s) => ({
        ...record(s.payload),
        id: s.id,
        inventoryId: s.inventoryId,
        lastHeartbeat: s.lastSeenAt,
        profile: profiles.find((p) => p.screenId === s.id) ?? null,
      }))
  }
  async profile(identity: string, input: unknown) {
    const screen = await this.db.client.screen.findUnique({ where: { id: identity } })
    if (!screen || record(screen.payload).archivedAt) fail('Screen not found.', 404)
    const parsed = profileSchema.parse(input)
    const registered = record(screen.payload)
    if (registered.width !== parsed.width || registered.height !== parsed.height)
      fail('Resolution must match the registered screen. Edit it in Screens first.')
    const result: Profile = {
      ...parsed,
      screenId: identity,
      enabled: false,
      testStatus: 'Untested',
    }
    await this.save(`profile-${identity}`, 'profile', result)
    return result
  }
  async testScreen(identity: string) {
    const p = await this.get<Profile>(`profile-${identity}`, 'profile')
    const test = await this.adapter.testInventory(p)
    const result = {
      ...p,
      testStatus: test.accepted ? 'Passed' : 'Failed',
      testedAt: new Date().toISOString(),
      enabled: false,
    }
    await this.save(`profile-${identity}`, 'profile', result)
    return {
      ...result,
      mode: 'mock',
      message: test.message,
    }
  }
  async enable(identity: string, input: unknown) {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(input)
    const p = await this.get<Profile>(`profile-${identity}`, 'profile')
    if (enabled && p.testStatus !== 'Passed') fail('Run Test SSP Sync before enabling.', 409)
    const result = { ...p, enabled }
    await this.save(`profile-${identity}`, 'profile', result)
    return result
  }
  async connections(): Promise<Record<string, unknown>[]> {
    const saved = await this.records<Record<string, unknown>>('connection')
    const startOfToday = new Date(new Date().toISOString().slice(0, 10))
    const transactionsToday = await this.db.client.programmaticTransaction.count({
      where: { occurredAt: { gte: startOfToday, lt: new Date(startOfToday.getTime() + 86400000) } },
    })
    const flow = ['Advertiser', 'Agency', 'DSP', 'Ad Exchange', 'SSP', 'CMS', 'Screen']
    const defaults = flow.map(
      (name) =>
        (saved.find((v) => v.name === name)
          ? { ...saved.find((v) => v.name === name), transactionsToday }
          : null) ?? {
          id: `connection-${name.replace(' ', '-')}`,
          name,
          mode: 'mock',
          status: 'Disconnected',
          lastSync: null,
          inventorySynced: 0,
          creativeSynced: 0,
          transactionsToday: 0,
        },
    )
    return [
      ...defaults,
      ...saved
        .filter((v) => !flow.includes(String(v.name)))
        .map((v) => ({ ...v, transactionsToday })),
    ]
  }
  async sync(input: unknown) {
    const { name, simulateError } = z
      .object({
        name: z.string().trim().min(1).max(150),
        simulateError: z.boolean().default(false),
      })
      .parse(input)
    const connection = (await this.connections()).find((c) => c.name === name)
    if (!connection) fail('Connection not found.', 404)
    if (connection.mode !== 'mock') fail('A real partner adapter is not configured.', 409)
    const id = String(connection.id)
    const [inventorySynced, creativeSynced, transactionsToday] = await Promise.all([
      this.db.client.inventory
        .findMany()
        .then((rows) => rows.filter((r) => !record(r.payload).archivedAt).length),
      this.db.client.creative
        .findMany()
        .then((rows) => rows.filter((r) => !record(r.payload).archivedAt).length),
      this.db.client.programmaticTransaction.count({
        where: {
          occurredAt: {
            gte: new Date(new Date().toISOString().slice(0, 10)),
            lt: new Date(Date.parse(new Date().toISOString().slice(0, 10)) + 86400000),
          },
        },
      }),
    ])
    const result = {
      ...connection,
      id,
      name,
      mode: 'mock',
      status: simulateError ? 'Error' : 'Connected',
      lastSync: new Date().toISOString(),
      inventorySynced: simulateError ? 0 : inventorySynced,
      creativeSynced: simulateError ? 0 : creativeSynced,
      transactionsToday,
      error: simulateError ? 'Simulated SSP inventory sync failure. Retry sync.' : null,
    }
    await this.save(id, 'connection', result)
    return result
  }
  async disconnect(input: unknown) {
    const { name } = z
      .object({
        name: z.string().trim().min(1).max(150),
      })
      .parse(input)
    const connection = (await this.connections()).find((c) => c.name === name)
    if (!connection) fail('Connection not found.', 404)
    const result = {
      ...connection,
      status: 'Disconnected',
      disconnectedAt: new Date().toISOString(),
      error: null,
    }
    // Keep the previous sync snapshot and transaction history for diagnostics.
    await this.save(String(connection.id), 'connection', result)
    return result
  }
  async saveConnection(identity: string | undefined, input: unknown) {
    const value = z
      .object({
        name: z.string().trim().min(1).max(150),
        mode: z.enum(['mock', 'partner']).default('mock'),
        node: z.enum(['DSP', 'SSP', 'CMS', 'Other']).default('Other'),
        url: z
          .string()
          .max(2000)
          .url()
          .refine((v) => {
            const u = new URL(v)
            return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password
          })
          .optional(),
        notes: z.string().max(2000).default(''),
      })
      .parse(input)
    const connections = await this.connections()
    const current = identity ? connections.find((c) => c.id === identity) : undefined
    if (identity && !current) fail('Connection not found.', 404)
    if (
      current &&
      ['Advertiser', 'Agency', 'DSP', 'Ad Exchange', 'SSP', 'CMS', 'Screen'].includes(
        String(current.name),
      ) &&
      current.name !== value.name
    )
      fail('Pipeline stage names cannot change.')
    if (
      current &&
      current.name !== value.name &&
      (await this.records<Deal>('deal', true)).some(
        (d) => d.dsp === current.name || d.ssp === current.name,
      )
    )
      fail('This partner name is referenced by deals. Create a new connection instead.', 409)
    if (connections.some((c) => c.name === value.name && c.id !== identity))
      fail('Connection name already exists.', 409)
    const result = {
      ...(current ?? {}),
      ...value,
      id: identity ?? `connection-${randomUUID()}`,
      status: 'Disconnected',
      lastSync: current?.lastSync ?? null,
      inventorySynced: current?.inventorySynced ?? 0,
      creativeSynced: current?.creativeSynced ?? 0,
      error: null,
    }
    await this.save(String(result.id), 'connection', result)
    return result
  }
  async removeConnection(identity: string) {
    const current = (await this.connections()).find((c) => c.id === identity)
    if (!current) fail('Connection not found.', 404)
    const deals = await this.records<Deal>('deal')
    if (
      deals.some((d) => d.status === 'Active' && (d.dsp === current.name || d.ssp === current.name))
    )
      fail('Pause the linked deals before removing this connection.', 409)
    await this.db.client.programmaticRecord.deleteMany({
      where: { id: identity, kind: 'connection' },
    })
    return {
      ok: true,
      reset: ['Advertiser', 'Agency', 'DSP', 'Ad Exchange', 'SSP', 'CMS', 'Screen'].includes(
        String(current.name),
      ),
    }
  }
  async removeProfile(identity: string) {
    const row = await this.db.client.programmaticRecord.findUnique({
      where: { id: `profile-${identity}` },
    })
    if (row?.kind !== 'profile') fail('Profile not found.', 404)
    if (record(row.payload).enabled) fail('Disable programmatic before removing its profile.', 409)
    await this.db.client.programmaticRecord.delete({ where: { id: row.id } })
    return { ok: true }
  }
  async transactions(input: unknown) {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        dealId: z
          .string()
          .regex(/^[a-zA-Z0-9_-]{1,100}$/)
          .optional(),
        source: z.enum(['mock', 'partner']).optional(),
      })
      .parse(input)
    const where = {
      ...(query.dealId ? { dealId: query.dealId } : {}),
      ...(query.source ? { source: query.source } : {}),
    }
    const pageSize = 50
    const [rows, total] = await Promise.all([
      this.db.client.programmaticTransaction.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.client.programmaticTransaction.count({ where }),
    ])
    return {
      data: rows.map((row) => ({
        ...row,
        spend: Number(row.spend),
        sspFee: Number(row.sspFee),
        cost: Number(row.cost),
      })),
      total,
      page: query.page,
      pageSize,
    }
  }
  async ingest(input: unknown) {
    const event = transactionSchema.parse(input)
    return this.db.transaction(async (c) => {
      await c.$queryRaw`SELECT id FROM programmatic_records WHERE id = ${event.dealId} FOR UPDATE`
      const prior = await c.programmaticTransaction.findUnique({ where: { id: event.id } })
      if (prior) {
        const same =
          prior.dealId === event.dealId &&
          prior.inventoryId === event.inventoryId &&
          prior.source === event.source &&
          prior.occurredAt.toISOString() === new Date(event.occurredAt).toISOString() &&
          ['impressions', 'requests', 'bids', 'wins', 'spend', 'sspFee', 'cost'].every(
            (k) =>
              Number(prior[k as keyof typeof prior]) === Number(event[k as keyof typeof event]),
          )
        if (!same) fail('Transaction ID already has different content.', 409)
        return { duplicate: true, id: event.id }
      }
      const row = await c.programmaticRecord.findUnique({ where: { id: event.dealId } })
      if (row?.kind !== 'deal' || record(row.payload).archivedAt) fail('Deal not found.', 404)
      const deal = record(row.payload) as Deal
      if (deal.status !== 'Active') fail('Only Active deals accept transactions.', 409)
      if (!deal.inventoryIds.includes(event.inventoryId)) fail('Placement is outside this deal.')
      if (event.source !== deal.source)
        fail('Cannot mix mock and partner transactions in a deal.', 409)
      const date = isoDay(new Date(event.occurredAt))
      if (
        date < deal.startDate ||
        date > deal.endDate ||
        (event.source === 'partner' && Date.parse(event.occurredAt) > Date.now())
      )
        fail('Transaction is outside flight or in the future.')
      const total = await c.programmaticTransaction.aggregate({
        where: { dealId: deal.id },
        _sum: { spend: true },
      })
      if (Number(total._sum.spend ?? 0) + event.spend > deal.budget)
        fail('Transaction exceeds remaining budget.', 409)
      await c.programmaticTransaction.create({
        data: { ...event, occurredAt: new Date(event.occurredAt) },
      })
      return { duplicate: false, id: event.id }
    })
  }
  async simulate(identity: string) {
    const deal = await this.get<Deal>(identity, 'deal')
    if (deal.source !== 'mock') fail('Simulation is only available for mock deals.')
    const now = new Date(
      Math.max(
        Date.parse(deal.startDate) + 12 * 3600000,
        Math.min(Date.now(), Date.parse(deal.endDate) + 12 * 3600000),
      ),
    )
    const summary = await this.metrics(identity)
    const impressions = Math.min(
      10000,
      Math.floor(((deal.budget - summary.spend) * 1000) / deal.cpm),
    )
    if (impressions <= 0) fail('Budget exhausted.', 409)
    return this.ingest({
      id: `tx-${randomUUID()}`,
      dealId: identity,
      inventoryId: deal.inventoryIds[0],
      occurredAt: now.toISOString(),
      source: 'mock',
      impressions,
      requests: 1000,
      bids: 700,
      wins: 217,
      spend: round((impressions * deal.cpm) / 1000),
      sspFee: round((((impressions * deal.cpm) / 1000) * deal.sspFeePercent) / 100),
      cost: round(((impressions * deal.cpm) / 1000) * 0.5),
    })
  }
  async metrics(identity: string, period = 'day') {
    const deal = await this.get<Deal>(identity, 'deal')
    const rows = await this.db.client.programmaticTransaction.findMany({
      where: { dealId: identity },
      orderBy: { occurredAt: 'asc' },
    })
    let spend = 0,
      impressions = 0,
      requests = 0,
      bids = 0,
      wins = 0,
      sspFee = 0,
      cost = 0
    const buckets: Record<string, { time: string; impressions: number; spend: number }> = {}
    for (const r of rows) {
      spend += Number(r.spend)
      impressions += r.impressions
      requests += r.requests
      bids += r.bids
      wins += r.wins
      sspFee += Number(r.sspFee)
      cost += Number(r.cost)
      const time = r.occurredAt.toISOString().slice(0, period === 'hour' ? 13 : 10)
      buckets[time] ??= { time, impressions: 0, spend: 0 }
      const bucket = buckets[time]
      bucket.impressions += r.impressions
      bucket.spend = round(bucket.spend + Number(r.spend))
    }
    const asOf =
      deal.source === 'mock' && rows.length
        ? Math.max(Date.now(), rows[rows.length - 1].occurredAt.getTime())
        : Date.now()
    const elapsed = Math.max(
      0,
      Math.min(
        1,
        (asOf - Date.parse(deal.startDate)) /
          (Date.parse(deal.endDate) + 86400000 - Date.parse(deal.startDate)),
      ),
    )
    return {
      deal,
      spend: round(spend),
      impressions,
      requests,
      bids,
      wins,
      sspFee: round(sspFee),
      cost: round(cost),
      revenue: round(spend - sspFee),
      margin: round(spend - sspFee - cost),
      cpm: impressions ? round((spend / impressions) * 1000) : null,
      delivery: round((impressions / deal.impressionTarget) * 100),
      pacing: elapsed ? round((impressions / deal.impressionTarget / elapsed) * 100) : null,
      fillRate: requests ? round((wins / requests) * 100) : null,
      winRate: bids ? round((wins / bids) * 100) : null,
      series: Object.values(buckets),
      transactionCount: rows.length,
      timezone: 'UTC',
      asOf: new Date(asOf).toISOString(),
    }
  }
  async operations() {
    const [screens, connections, deals, creatives] = await Promise.all([
      this.profiles(),
      this.connections(),
      this.records<Deal>('deal'),
      this.db.client.creative.findMany(),
    ])
    const issues: { id: string; title: string; action: string; href: string; source: string }[] = []
    for (const s of screens) {
      if (s.lastHeartbeat && Date.now() - new Date(s.lastHeartbeat).getTime() > 300000)
        issues.push({
          id: `offline-${s.id}`,
          title: `Screen ${s.id} heartbeat overdue`,
          action: 'Check the player tab, network and pairing token. Reopen the player.',
          href: '/screens',
          source: 'measured heartbeat',
        })
      if (s.profile && s.profile.testStatus !== 'Passed')
        issues.push({
          id: `test-${s.id}`,
          title: `Screen ${s.id} SSP test pending`,
          action: 'Validate resolution, venue and SSP inventory ID; run Test SSP Sync.',
          href: '/onboarding',
          source: 'mock configuration',
        })
      if (s.profile)
        for (const creative of creatives) {
          const payload = record(creative.payload)
          const dimensions =
            payload.width && payload.height
              ? `${payload.width}x${payload.height}`
              : String(payload.dimensions ?? '')
          const match = dimensions.match(/(\d+)\s*[x×]\s*(\d+)/)
          if (
            match &&
            Math.abs(Number(match[1]) / Number(match[2]) - s.profile.width / s.profile.height) >
              0.05
          )
            issues.push({
              id: `ratio-${s.id}-${creative.id}`,
              title: `Creative ${creative.id}: incompatible aspect ratio for ${s.id}`,
              action:
                'Export a creative variant matching the screen resolution. No partner rejection is implied.',
              href: '/creatives',
              source: 'local validation',
            })
        }
    }
    for (const c of connections)
      if (c.status === 'Error')
        issues.push({
          id: String(c.id),
          title: String(c.error),
          action:
            'Retry mock sync. For real adapters, inspect partner credentials and response logs.',
          href: '/programmatic/connections',
          source: 'mock adapter',
        })
    for (const d of deals.filter((d) => d.status === 'Active')) {
      const m = await this.metrics(d.id)
      if (m.pacing !== null && m.pacing < 80)
        issues.push({
          id: `pacing-${d.id}`,
          title: `${d.name} under-pacing ${round(m.pacing - 100)}%`,
          action:
            'Review eligible inventory, flight dates and floor CPM. Compare available capacity with target.',
          href: '/monitor',
          source: d.source,
        })
      if (m.requests > 0 && m.bids === 0)
        issues.push({
          id: `bids-${d.id}`,
          title: `${d.name}: no bid responses from DSP`,
          action: 'Check DSP targeting, deal ID mapping and floor price.',
          href: '/deals',
          source: d.source,
        })
    }
    for (const d of deals.filter((d) => d.type === 'PG' && d.status !== 'Completed')) {
      const days = (Date.parse(d.endDate) - Date.parse(d.startDate)) / 86400000 + 1
      let capacity = 0
      for (const screen of screens) {
        const p = screen.profile
        if (!d.inventoryIds.includes(screen.inventoryId ?? '') || !p?.enabled || p.ssp !== d.ssp)
          continue
        const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
        const seconds =
          ((minutes(p.operatingEnd) - minutes(p.operatingStart) + 1440) % 1440 || 1440) * 60
        capacity += Math.floor(seconds / p.loopDuration) * days * p.audiencePerPlay
      }
      if (capacity < d.impressionTarget)
        issues.push({
          id: `forecast-${d.id}`,
          title: `${d.name}: PG forecast insufficient inventory`,
          action: `Modeled capacity ${capacity} versus target ${d.impressionTarget}. Add eligible screens or reduce the target. Audience per play is an assumption.`,
          href: '/onboarding',
          source: d.source,
        })
    }
    const manual = (await this.records<Record<string, unknown>>('workspace-issues'))
      .filter((i) => i.status !== 'Resolved')
      .map((i) => ({
        id: String(i.id),
        title: String(i.name),
        action: String(i.action),
        href: String(i.href),
        source: 'manual',
      }))
    return [...issues, ...manual]
  }
  async demo() {
    const configuration = await this.db.client.workspaceSetting.findUniqueOrThrow({
      where: { key: 'programmatic' },
    })
    const defaults = record(configuration.payload)
    const inventory = await this.db.client.inventory.findFirst({ orderBy: { id: 'asc' } })
    const project = await this.db.client.project.findFirst({ orderBy: { id: 'asc' } })
    if (!inventory) fail('Import inventory first.', 409)
    const placement = record(inventory.payload)
    const screenId = `screen-programmatic-${randomUUID()}`
    await this.db.client.screen.create({
      data: {
        id: screenId,
        inventoryId: inventory.id,
        payload: json({
          id: screenId,
          name: 'Programmatic mock screen',
          inventoryId: inventory.id,
          location: placement.area,
          latitude: placement.latitude ?? defaults.profile.latitude,
          longitude: placement.longitude ?? defaults.profile.longitude,
          format: 'landscape',
          width: 1920,
          height: 1080,
          preview: true,
        }),
      },
    })
    await this.profile(screenId, {
      ...defaults.profile,
      venueId: 'DEMO-BKK-01',
      latitude: placement.latitude ?? defaults.profile.latitude,
      longitude: placement.longitude ?? defaults.profile.longitude,
      sspInventoryId: `mock-${screenId}`,
    })
    await this.testScreen(screenId)
    await this.enable(screenId, { enabled: true })
    const startDate = isoDay(inventory.availableFrom)
    const endDate = isoDay(inventory.availableTo)
    const deal = await this.createDeal({
      ...defaults.deal,
      name: `${project ? record(project.payload).name : 'Media OS'} • Programmatic demo`,
      inventoryIds: [inventory.id],
      projectId: project?.id,
      startDate,
      endDate,
    })
    await this.status(deal.id, { status: 'Active' })
    const days = Math.min(
      16,
      Math.floor((Date.parse(endDate) - Date.parse(startDate)) / 86400000) + 1,
    )
    for (let day = 0; day < days; day++)
      for (let hour = 8; hour <= 20; hour += 4) {
        const impressions = 18000 + day * 1400 + hour * 200
        const spend = round((impressions * 191) / 1000)
        await this.ingest({
          id: `tx-${randomUUID()}`,
          dealId: deal.id,
          inventoryId: inventory.id,
          occurredAt: new Date(
            Date.parse(startDate) + day * 86400000 + hour * 3600000,
          ).toISOString(),
          source: 'mock',
          impressions,
          requests: 1000,
          bids: 700,
          wins: 217,
          spend,
          sspFee: round(spend * 0.15),
          cost: round(spend * 0.5),
        })
      }
    return { dealId: deal.id, screenId, source: 'mock' }
  }
  async commercial(input?: unknown, month = new Date().toISOString().slice(0, 7)) {
    if (input) {
      const settings = z
        .object({
          target: z.number().positive().max(1e10),
          month: z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
            .optional(),
        })
        .parse(input)
      month = settings.month ?? month
      await this.save(`commercial-target-${month}`, 'settings', { target: settings.target })
    }
    const settings = await this.db.client.programmaticRecord.findUnique({
      where: { id: `commercial-target-${month}` },
    })
    z.string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(month)
    const defaults = await this.db.client.workspaceSetting.findUniqueOrThrow({
      where: { key: 'programmatic' },
    })
    const target = settings
      ? Number(record(settings.payload).target)
      : Number(record(defaults.payload).revenueTarget)
    const deals = await this.records<Deal>('deal', true)
    const metrics = await Promise.all(deals.map((d) => this.metrics(d.id)))
    const monthly = await this.db.client.programmaticTransaction.findMany({
      where: {
        occurredAt: {
          gte: new Date(`${month}-01T00:00:00Z`),
          lt: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)),
        },
      },
    })
    const groups = {
      dsp: {} as Record<string, number>,
      ssp: {} as Record<string, number>,
      inventory: {} as Record<string, number>,
    }
    let revenue = 0
    const bySource = { mock: 0, partner: 0 }
    for (const tx of monthly) {
      const d = deals.find((d) => d.id === tx.dealId)
      if (!d) continue
      const net = Number(tx.spend) - Number(tx.sspFee)
      revenue += net
      bySource[tx.source as 'mock' | 'partner'] = round(
        bySource[tx.source as 'mock' | 'partner'] + net,
      )
      for (const [group, key] of [
        ['dsp', d.dsp],
        ['ssp', d.ssp],
        ['inventory', tx.inventoryId],
      ] as const)
        groups[group][key] = round((groups[group][key] ?? 0) + net)
    }
    return {
      target,
      revenue: round(revenue),
      month,
      groups,
      deals: metrics,
      bySource,
      note: 'Recorded transactions; payment stages are internal workflow records, not bank settlements.',
    }
  }
  async resetCommercialTarget(month: string) {
    z.string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(month)
    await this.db.client.programmaticRecord.deleteMany({
      where: { id: `commercial-target-${month}`, kind: 'settings' },
    })
    return { ok: true }
  }
  async commercialStage(identity: string, input: unknown) {
    const { stage, reference } = z
      .object({
        stage: z.enum(['Quotation', 'Campaign', 'Invoice', 'Paid']),
        reference: z.string().trim().min(3).max(150),
      })
      .parse(input)
    return this.db.transaction(async (c) => {
      await c.$queryRaw`SELECT id FROM programmatic_records WHERE id = ${identity} FOR UPDATE`
      const row = await c.programmaticRecord.findUnique({ where: { id: identity } })
      if (row?.kind !== 'deal' || record(row.payload).archivedAt) fail('Deal not found.', 404)
      const deal = record(row.payload) as Deal
      const steps = ['Proposal', 'Quotation', 'Campaign', 'Invoice', 'Paid']
      if (steps.indexOf(stage) !== steps.indexOf(deal.stage) + 1)
        fail('Commercial steps must advance in order.', 409)
      if (stage === 'Campaign' && deal.status !== 'Active')
        fail('Activate the deal before the Campaign step.', 409)
      const result = {
        ...deal,
        stage,
        paymentStatus: stage === 'Paid' ? 'Paid' : stage === 'Invoice' ? 'Pending' : 'Unpaid',
        history: [
          ...(record(row.payload).history ?? []),
          { stage, reference, at: new Date().toISOString(), source: 'manual demo record' },
        ],
      }
      await c.programmaticRecord.update({
        where: { id: identity },
        data: { payload: json(result) },
      })
      return result
    })
  }
}
