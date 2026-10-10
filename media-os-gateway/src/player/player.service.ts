import { Injectable } from '@nestjs/common'
import { z } from 'zod'
import { fail, type StoredRecord } from '../common/contracts.js'
import { GatewayStore } from '../database/gateway-store.service.js'
import { id } from '../domain.js'
@Injectable()
export class PlayerService {
  constructor(private readonly store: GatewayStore) {}
  async getPlayerPlaylist(screen: StoredRecord) {
    return {
      screen,
      items: await this.store.playlist(screen),
      serverTime: new Date().toISOString(),
    }
  }
  async heartbeat(screen: StoredRecord) {
    await this.store.database.client.screen.update({
      where: { id: screen.id },
      data: { lastSeenAt: new Date() },
    })
    return { ok: true }
  }
  async recordPlayback(body: unknown, screen: StoredRecord) {
    const event = z
      .object({
        sessionId: z.uuid(),
        creativeId: id,
        event: z.enum(['start', 'complete']),
        durationMs: z.number().int().min(0).max(86400000).optional(),
      })
      .parse(body)
    const db = this.store.database.client
    if (event.event === 'start') {
      const item = (await this.store.playlist(screen)).find((i) => i.id === event.creativeId)
      if (!item) fail('Creative is no longer in this screen playlist.', 409)
      await db.playbackSession.createMany({
        data: [
          {
            id: event.sessionId,
            screenId: screen.id,
            creativeId: item.id,
            campaignId: item.campaignId,
            mode: item.mode,
          },
        ],
        skipDuplicates: true,
      })
    } else {
      const r = await db.playbackSession.findFirst({
        where: { id: event.sessionId, screenId: screen.id, creativeId: event.creativeId },
      })
      if (!r) fail('Start playback before completing it.', 409)
      const elapsed = Date.now() - r.startedAt.getTime()
      if (elapsed < 1000) fail('Playback duration is too short.')
      // Conditional update keeps duplicate completion events idempotent under concurrency.
      await db.playbackSession.updateMany({
        where: { id: event.sessionId, completedAt: null },
        data: {
          completedAt: new Date(),
          durationMs: Math.min(elapsed, event.durationMs ?? elapsed),
        },
      })
    }
    return { ok: true }
  }
}
