import { mkdir, writeFile } from 'node:fs/promises'
import { Injectable } from '@nestjs/common'
import { z } from 'zod'
import { fail } from '../common/contracts.js'
import { GatewayStore } from '../database/gateway-store.service.js'
import { creativeSchema, inventorySchema, plan, projectSchema } from '../domain.js'
@Injectable()
export class CatalogService {
  constructor(private readonly store: GatewayStore) {}
  async listProjects() {
    return { data: await this.store.rows('projects'), meta: { source: 'postgresql' } }
  }
  async saveProject(body: unknown) {
    return await this.store.upsertProject(body)
  }
  async syncProject(identity: string) {
    try {
      const p = await this.store.one('projects', identity)
      if (!p) fail('Project not found.', 404)
      const allowed = (process.env.PROJECT_PUBLIC_HOSTS || 'example.com').split(',')
      let url: string = p.url
      let response: Response | undefined
      for (let n = 0; n < 4; n++) {
        if (!allowed.includes(new URL(url).hostname))
          fail('Public metadata sync is limited to configured project hosts.')
        response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
        if (response.status >= 300 && response.status < 400) {
          url = new URL(response.headers.get('location') ?? '', url).href
          continue
        }
        break
      }
      if (
        !response?.ok ||
        !response.body ||
        !response.headers.get('content-type')?.includes('text/html')
      )
        fail('Public site metadata could not be read.', 502)
      const reader = response.body.getReader()
      let chunks = '',
        size = 0
      const decoder = new TextDecoder()
      while (size < 350000) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        chunks += decoder.decode(value, { stream: true })
        if (chunks.includes('</head>')) break
      }
      await reader.cancel()
      const description = chunks.match(
        /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)/i,
      )?.[1]
      const decode = (s: string) =>
        s
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#x27;|&#39;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
      const updated = await this.store.upsertProject({
        ...p,
        description: description ? decode(description) : p.description,
        reviewedAt: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(
          new Date(),
        ),
      })
      return updated
    } catch (error) {
      if (
        (error instanceof Error && error.name) === 'TimeoutError' ||
        (error instanceof Error && error.name) === 'AbortError' ||
        (error instanceof Error && error.message) === 'fetch failed'
      )
        fail(
          'Public website is temporarily unavailable. Saved project data is unchanged; retry sync later.',
          502,
        )
      throw error
    }
  }
  async listInventory(query: Record<string, unknown>) {
    let data = await this.store.rows('inventory')
    if (query.area)
      data = data.filter((i) => i.area.toLowerCase() === String(query.area).toLowerCase())
    if (query.type)
      data = data.filter((i) => i.type.toLowerCase().includes(String(query.type).toLowerCase()))
    return {
      data,
      meta: {
        demo: data.every((i) => i.id.startsWith('demo-')),
        source: 'postgresql',
        count: data.length,
      },
    }
  }
  async getInventory(identity: string) {
    const i = await this.store.one('inventory', identity)
    if (!i) fail('Placement not found.', 404)
    return i
  }
  async saveInventory(body: unknown) {
    return await this.store.upsertInventory(body)
  }
  async recommendPlan(body: unknown) {
    return plan(body, await this.store.rows('inventory'))
  }
  async listCreatives() {
    return { data: await this.store.rows('creatives') }
  }
  async createCreative(body: unknown) {
    return await this.store.createCreative(body)
  }
  async uploadCreative(body: unknown, headers: Record<string, string | string[] | undefined>) {
    const buffer = body
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) fail('Upload an image or video file.')
    let extension: string
    let kind: 'image' | 'video'
    if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      extension = 'png'
      kind = 'image'
    } else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) {
      extension = 'jpg'
      kind = 'image'
    } else if (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      extension = 'webp'
      kind = 'image'
    } else if (buffer.toString('ascii', 0, 3) === 'GIF') {
      extension = 'gif'
      kind = 'image'
    } else if (buffer.toString('ascii', 4, 8) === 'ftyp') {
      extension = 'mp4'
      kind = 'video'
    } else if (buffer.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) {
      extension = 'webm'
      kind = 'video'
    } else fail('Supported files: PNG, JPG, WebP, GIF, MP4 and WebM.')
    const name = decodeURIComponent(String(headers['x-file-name'] || 'Uploaded creative')).slice(
      0,
      180,
    )
    const filename = `${crypto.randomUUID()}.${extension}`
    await mkdir('/app/uploads', { recursive: true })
    await writeFile(`/app/uploads/${filename}`, buffer)
    return await this.store.createCreative({
      name,
      kind,
      url: `/uploads/${filename}`,
      durationSeconds: 15,
    })
  }
  async importCatalog(body: unknown) {
    const b = z
      .object({
        projects: z.array(projectSchema).max(500).default([]),
        inventory: z.array(inventorySchema).max(500).default([]),
        creatives: z.array(creativeSchema).max(500).default([]),
      })
      .parse(body)
    await this.store.database.transaction(async (c) => {
      for (const p of b.projects) await this.store.upsertProject(p, c)
      for (const i of b.inventory) await this.store.upsertInventory(i, c)
      for (const creative of b.creatives) await this.store.createCreative(creative, c)
    })
    return {
      imported: {
        projects: b.projects.length,
        inventory: b.inventory.length,
        creatives: b.creatives.length,
      },
    }
  }
  async exportCatalog() {
    return {
      projects: await this.store.rows('projects'),
      inventory: await this.store.rows('inventory'),
      creatives: await this.store.rows('creatives'),
      campaigns: await this.store.rows('campaigns'),
    }
  }
}
