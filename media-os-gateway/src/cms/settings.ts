import { z } from 'zod'
import { creativeSchema, inventorySchema, projectSchema, safeUrl } from '../domain.js'
import { dealSchema, profileSchema } from '../programmatic/contracts.js'

const text = z.string().trim().min(1).max(3000)
const icon = z.enum([
  'home',
  'pin',
  'spark',
  'play',
  'chart',
  'image',
  'check',
  'doc',
  'card',
  'people',
  'screen',
  'pie',
])
const photo = z.object({
  src: safeUrl,
  alt: text,
  author: text,
  source: z.url().refine((v) => ['https:', 'http:'].includes(new URL(v).protocol)),
  license: text,
  licenseUrl: z.url().refine((v) => ['https:', 'http:'].includes(new URL(v).protocol)),
})
const analytics = z.object({
  campaignId: text,
  reach: text,
  frequency: text,
  proofOfPlay: text,
  deliveredPlays: z.number().int().nonnegative(),
  scheduledPlays: z.number().int().nonnegative(),
  storeVisits: text,
  engagements: text,
  roas: text,
  topLocations: z.array(z.object({ area: text, impressions: text, proofOfPlay: text })).max(100),
  deliveredImpressions: text.optional(),
  trend: z.array(z.number().min(0).max(100)).max(366).optional(),
  measurementSource: z.literal('mock').default('mock'),
})
export const settingSchemas = {
  overview: z.object({
    source: z.literal('mock'),
    network: z.object({
      availableUnits: z.number().int().nonnegative(),
      provinces: z.number().int().nonnegative(),
      digitalUnits: z.number().int().nonnegative(),
      fillRate: text,
    }),
    kpis: z.array(z.object({ icon, label: text, value: text, note: text })).max(12),
  }),
  areaPhotos: z.record(z.string().min(1).max(100), photo),
  planning: z
    .object({
      demoCreativeId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
      demoCampaignName: text,
      budget: z.number().positive().max(1e12),
      objective: z.enum(['Product Launch', 'Brand Awareness', 'Store Traffic']),
      audience: text,
      startDate: z.iso.date(),
      endDate: z.iso.date(),
      objectives: z
        .array(z.enum(['Product Launch', 'Brand Awareness', 'Store Traffic']))
        .min(1)
        .max(3),
      mapFilters: z
        .array(z.enum(['All Media', 'Digital', 'Transit', 'Airport', 'Retail']))
        .min(1)
        .max(5),
    })
    .refine((v) => v.endDate >= v.startDate, 'End date must follow start date.'),
  analytics: z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), analytics),
  programmatic: z.object({
    profile: profileSchema.safeExtend({
      venueId: z.string().max(100),
      sspInventoryId: z.string().max(100),
    }),
    deal: z
      .object({
        type: dealSchema.shape.type,
        dsp: dealSchema.shape.dsp,
        ssp: dealSchema.shape.ssp,
        cpm: dealSchema.shape.cpm,
        floorCpm: dealSchema.shape.floorCpm,
        budget: dealSchema.shape.budget,
        impressionTarget: dealSchema.shape.impressionTarget,
        sspFeePercent: dealSchema.shape.sspFeePercent,
      })
      .refine((v) => v.cpm >= v.floorCpm, 'CPM must meet floor CPM.'),
    revenueTarget: z.number().positive().max(1e10),
  }),
  importTemplate: z.object({
    projects: z.array(projectSchema).max(500),
    inventory: z.array(inventorySchema).max(500),
    creatives: z.array(creativeSchema).max(500),
  }),
}
