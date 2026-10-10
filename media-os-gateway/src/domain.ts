import { z } from 'zod'
export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)
const text = z.string().trim().min(1).max(500)
export const safeUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    if (/^\/(projects|areas|uploads|assets)\/[a-zA-Z0-9/_%.?=&-]+$/.test(value)) return true
    try {
      const u = new URL(value)
      return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password
    } catch {
      return false
    }
  }, 'Use an http(s) URL or a supported local asset path.')
export const projectSchema = z.object({
  id,
  dataSource: z.enum(['mock', 'real']).default('real'),
  name: text,
  category: text,
  url: z.url().startsWith('https://'),
  image: safeUrl,
  description: z.string().min(1).max(3000),
  capabilities: z.array(text).max(20),
  publicStatus: text,
  reviewedAt: z.iso.date(),
  suggestedBrief: z.object({
    name: text,
    objective: z.enum(['Product Launch', 'Brand Awareness', 'Store Traffic']),
    audience: text,
  }),
})
export const inventorySchema = z
  .object({
    id,
    name: text,
    area: text,
    type: text,
    dataSource: z.enum(['mock', 'real']).default('real'),
    price: z.number().finite().nonnegative().max(1e10),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    availableFrom: z.iso.date(),
    availableTo: z.iso.date(),
    format: text.optional(),
    dimensions: text.optional(),
    reach: text.default('Not modeled'),
    estimatedImpressions: text.default('Not modeled'),
  })
  .refine((v) => v.availableTo >= v.availableFrom, 'Availability end must follow start.')
export const creativeSchema = z
  .object({
    dataSource: z.enum(['mock', 'real']).default('real'),
    name: text,
    kind: z.enum(['image', 'video', 'web', 'project']),
    url: safeUrl.optional(),
    projectId: id.optional(),
    durationSeconds: z.number().int().min(2).max(3600).default(15),
    fit: z.enum(['contain', 'cover']).default('contain'),
    width: z.number().int().min(1).max(32768).optional(),
    height: z.number().int().min(1).max(32768).optional(),
  })
  .refine(
    (v) => (v.kind === 'project' ? Boolean(v.projectId) : Boolean(v.url)),
    'Choose a source project or content URL.',
  )
  .refine((v) => Boolean(v.width) === Boolean(v.height), 'Supply both creative width and height.')
export const screenSchema = z.object({
  name: text,
  inventoryId: id,
  location: text,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  format: z.enum(['landscape', 'portrait', 'square', 'ultrawide', 'classic', 'custom']),
  width: z.number().int().min(100).max(16000),
  height: z.number().int().min(100).max(16000),
  preview: z.boolean().default(true),
})
export const campaignSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    objective: text,
    audience: text.optional(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    budget: z.number().finite().positive().max(1e12),
    inventoryIds: z.array(id).min(1).max(200),
    creativeId: id.optional(),
    creativeName: text.optional(),
    sourceProjectId: id.optional(),
  })
  .refine((v) => Boolean(v.creativeId || v.creativeName), 'Choose a creative.')
export function days(start: string, end: string) {
  const d = (Date.parse(end) - Date.parse(start)) / 86400000 + 1
  return d > 0 && d <= 366 ? d : 0
}
export type Inventory = z.infer<typeof inventorySchema>
export function cost(items: Pick<Inventory, 'price'>[], start: string, end: string) {
  return items.reduce((s, i) => s + Math.round((i.price * days(start, end)) / 7), 0)
}
export function plan(input: unknown, inventory: Inventory[]) {
  const b = z
    .object({
      budget: z.number().positive(),
      startDate: z.iso.date(),
      endDate: z.iso.date(),
      objective: text,
      audience: text,
      areas: z.array(text).optional(),
    })
    .parse(input)
  if (!days(b.startDate, b.endDate))
    throw Object.assign(new Error('Choose a valid period of up to 366 days.'), { status: 400 })
  const preferred =
    b.objective === 'Store Traffic'
      ? 'Retail'
      : b.objective === 'Brand Awareness'
        ? 'Transit'
        : 'Digital'
  const ranked = inventory
    .filter(
      (i) =>
        i.availableFrom <= b.startDate &&
        i.availableTo >= b.endDate &&
        (!b.areas?.length || b.areas.includes(i.area)),
    )
    .map((i) => ({
      i,
      score:
        (i.type.includes(preferred) ? 4 : 0) +
        (/commut|office/i.test(b.audience) && i.type.includes('Transit') ? 3 : 0) +
        (/shop|retail/i.test(b.audience) && i.type.includes('Retail') ? 3 : 0),
    }))
    .sort((a, c) => c.score - a.score || a.i.price - c.i.price)
  const selected: Inventory[] = []
  for (const { i } of ranked)
    if (cost([...selected, i], b.startDate, b.endDate) <= b.budget) selected.push(i)
  if (!selected.length)
    throw Object.assign(new Error('No placement fits these dates and budget.'), { status: 400 })
  const totalCost = cost(selected, b.startDate, b.endDate)
  return {
    ...b,
    id: `plan-${crypto.randomUUID()}`,
    period: `${b.startDate} – ${b.endDate}`,
    areas: [...new Set(selected.map((i) => i.area))],
    score: Math.round((totalCost / b.budget) * 100),
    estimatedReach: 'Not deduplicated',
    estimatedFrequency: 'Not modeled',
    inventoryIds: selected.map((i) => i.id),
    totalCost,
    generatedAt: new Date().toISOString(),
    allocations: [
      ...selected.map((i) => ({
        type: i.name,
        areas: i.area,
        percentage: Math.round((cost([i], b.startDate, b.endDate) / b.budget) * 100),
        cost: cost([i], b.startDate, b.endDate),
        reach: i.reach,
        rationale: i.type.includes(preferred)
          ? `Prioritized ${i.type} for ${b.objective}.`
          : 'Adds coverage within budget.',
      })),
      {
        type: 'Unallocated budget',
        areas: 'Available for adjustments',
        percentage: Math.round(((b.budget - totalCost) / b.budget) * 100),
        cost: b.budget - totalCost,
        reach: '—',
        rationale: 'Remaining budget.',
      },
    ],
  }
}
