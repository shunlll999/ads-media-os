import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { z } from 'zod'
import { fail } from '../common/contracts.js'
import { DatabaseService } from '../database/database.service.js'
import { json, record } from '../database/gateway-store.service.js'
import { id } from '../domain.js'
import { ProgrammaticModule } from '../programmatic/programmatic.controller.js'
import { ProgrammaticService } from '../programmatic/programmatic.service.js'

const title = z.string().trim().min(1).max(150)
const money = z.number().finite().nonnegative().max(1e10)
const document = z.object({
  name: title,
  dealId: id,
  amount: money,
  reference: title,
  stage: z.enum(['Proposal', 'Quotation', 'Campaign', 'Invoice', 'Paid']),
  notes: z.string().max(2000).default(''),
})
const schemas = {
  audience: z.object({
    name: title,
    inventoryIds: z.array(id).max(100),
    description: z.string().max(2000),
    estimatedAudience: z.number().int().nonnegative().max(2e9),
    dataSource: z.enum(['mock', 'real']),
  }),
  sources: z.object({
    name: title,
    url: z
      .string()
      .max(2000)
      .url()
      .refine((v) => {
        const u = new URL(v)
        return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password
      }),
    projectId: id.optional(),
    status: z.enum(['Draft', 'Configured', 'Disabled']),
    notes: z.string().max(2000).default(''),
  }),
  issues: z.object({
    name: title,
    severity: z.enum(['Info', 'Warning', 'Critical']),
    status: z.enum(['Open', 'Investigating', 'Resolved']),
    action: z.string().min(1).max(2000),
    href: z
      .string()
      .regex(/^\/[a-zA-Z0-9_/?=&-]*$/)
      .default('/operations'),
  }),
  proposals: document.refine(
    (v) => ['Proposal', 'Quotation', 'Campaign'].includes(v.stage),
    'Proposal stage required.',
  ),
  invoices: document.refine(
    (v) => ['Invoice', 'Paid'].includes(v.stage),
    'Invoice stage required.',
  ),
  reports: z.object({
    name: title,
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    notes: z.string().max(2000).default(''),
  }),
} as const
const resource = z.enum(['audience', 'sources', 'issues', 'proposals', 'invoices', 'reports'])
@Injectable()
class WorkspaceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly programmatic: ProgrammaticService,
  ) {}
  async list(kind: string) {
    resource.parse(kind)
    return {
      data: (
        await this.db.client.programmaticRecord.findMany({
          where: { kind: `workspace-${kind}` },
          orderBy: { id: 'asc' },
        })
      ).map((r) => record(r.payload)),
    }
  }
  async save(kind: string, identity: string | undefined, body: unknown) {
    const key = resource.parse(kind)
    const value = schemas[key].parse(body) as Record<string, any>
    const recordId = identity ? id.parse(identity) : `${kind}-${crypto.randomUUID()}`
    const snapshot =
      key === 'reports' ? await this.programmatic.commercial(undefined, value.month) : undefined
    return this.db.transaction(async (c) => {
      if (identity) {
        await c.$queryRaw`SELECT id FROM programmatic_records WHERE id=${identity} FOR UPDATE`
        const current = await c.programmaticRecord.findUnique({ where: { id: identity } })
        if (current?.kind !== `workspace-${key}`) fail('Record not found.', 404)
      }
      if (key === 'audience') {
        const inventory = await c.inventory.findMany({ where: { id: { in: value.inventoryIds } } })
        if (
          inventory.length !== new Set(value.inventoryIds).size ||
          inventory.some((r) => record(r.payload).archivedAt)
        )
          fail('Unknown inventory.')
      }
      if (value.projectId) {
        const project = await c.project.findUnique({ where: { id: value.projectId } })
        if (!project || record(project.payload).archivedAt) fail('Project not found.')
      }
      if (key === 'proposals' || key === 'invoices') {
        await c.$queryRaw`SELECT id FROM programmatic_records WHERE id=${value.dealId} FOR UPDATE`
        const dealRow = await c.programmaticRecord.findUnique({ where: { id: value.dealId } })
        if (dealRow?.kind !== 'deal' || record(dealRow.payload).archivedAt)
          fail('Deal not found.', 404)
        const deal = record(dealRow.payload),
          steps = ['Proposal', 'Quotation', 'Campaign', 'Invoice', 'Paid']
        if (value.stage !== deal.stage) {
          if (steps.indexOf(value.stage) !== steps.indexOf(deal.stage) + 1)
            fail('Commercial stages must advance in order.', 409)
          if (value.stage === 'Campaign' && deal.status !== 'Active')
            fail('Activate the deal before the Campaign step.', 409)
          await c.programmaticRecord.update({
            where: { id: value.dealId },
            data: {
              payload: json({
                ...deal,
                stage: value.stage,
                paymentStatus:
                  value.stage === 'Paid'
                    ? 'Paid'
                    : value.stage === 'Invoice'
                      ? 'Pending'
                      : 'Unpaid',
                history: [
                  ...(deal.history ?? []),
                  {
                    stage: value.stage,
                    reference: value.reference,
                    at: new Date().toISOString(),
                    source: recordId,
                  },
                ],
              }),
            },
          })
        }
      }
      const result = {
        ...value,
        id: recordId,
        ...(snapshot ? { snapshot } : {}),
        updatedAt: new Date().toISOString(),
      }
      await c.programmaticRecord.upsert({
        where: { id: recordId },
        create: { id: recordId, kind: `workspace-${key}`, payload: json(result) },
        update: { payload: json(result) },
      })
      return result
    })
  }
  async remove(kind: string, identity: string) {
    resource.parse(kind)
    id.parse(identity)
    const deleted = await this.db.client.programmaticRecord.deleteMany({
      where: { id: identity, kind: `workspace-${kind}` },
    })
    if (!deleted.count) fail('Record not found.', 404)
    return { ok: true }
  }
}
@Controller('v1/workspace')
class WorkspaceController {
  constructor(private readonly service: WorkspaceService) {}
  @Get(':kind') list(@Param('kind') kind: string) {
    return this.service.list(kind)
  }
  @Post(':kind') create(@Param('kind') kind: string, @Body() body: unknown) {
    return this.service.save(kind, undefined, body)
  }
  @Patch(':kind/:id') update(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.save(kind, id, body)
  }
  @Delete(':kind/:id') remove(@Param('kind') kind: string, @Param('id') id: string) {
    return this.service.remove(kind, id)
  }
}
@Module({
  imports: [ProgrammaticModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
})
export class WorkspaceModule {}
