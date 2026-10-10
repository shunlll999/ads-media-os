import { z } from 'zod'
import { id } from '../domain.js'

const name = z.string().trim().min(1).max(150)
const money = z.number().finite().min(0).max(1e10)
const day = z.iso.date()
export const dealSchema = z
  .object({
    name,
    source: z.enum(['mock', 'partner']).default('mock'),
    type: z.enum(['PMP', 'PG', 'Open Auction']),
    dsp: name,
    ssp: name,
    inventoryIds: z
      .array(id)
      .min(1)
      .max(100)
      .refine((v) => new Set(v).size === v.length),
    projectId: id.optional(),
    campaignId: id.optional(),
    cpm: money.positive(),
    floorCpm: money,
    budget: money.positive(),
    startDate: day,
    endDate: day,
    impressionTarget: z.number().int().positive().max(2_000_000_000),
    sspFeePercent: z.number().min(0).max(50).default(15),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'End date must follow start date.' })
export const profileSchema = z
  .object({
    venueId: name,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    screenSize: name,
    width: z.number().int().min(1).max(32768),
    height: z.number().int().min(1).max(32768),
    slotDuration: z.number().int().min(1).max(600),
    loopDuration: z.number().int().min(1).max(3600),
    operatingStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    operatingEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    cms: name,
    ssp: name,
    sspInventoryId: name,
    floorCpm: money,
    audiencePerPlay: z.number().int().min(1).max(1000).default(1),
  })
  .refine((v) => v.loopDuration >= v.slotDuration, { message: 'Loop must be at least one slot.' })
export const transactionSchema = z
  .object({
    id,
    dealId: id,
    inventoryId: id,
    occurredAt: z.iso.datetime({ offset: true }),
    source: z.enum(['mock', 'partner']),
    impressions: z.number().int().min(0).max(2e9),
    requests: z.number().int().min(0).max(2e9),
    bids: z.number().int().min(0).max(2e9),
    wins: z.number().int().min(0).max(2e9),
    spend: money,
    sspFee: money,
    cost: money,
  })
  .refine((v) => v.wins <= v.bids && v.bids <= v.requests && v.sspFee + v.cost <= v.spend, {
    message: 'Invalid funnel counts or fee/cost allocation.',
  })
export type Deal = z.infer<typeof dealSchema> & {
  id: string
  status: string
  source: string
  stage: string
  paymentStatus: string
}
export type Profile = z.infer<typeof profileSchema> & {
  screenId: string
  enabled: boolean
  testStatus: string
  testedAt?: string
}
