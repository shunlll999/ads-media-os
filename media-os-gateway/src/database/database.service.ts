import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { type Prisma, PrismaClient } from '../generated/prisma/client.js'
export type Queryable = Prisma.TransactionClient
export type Table = 'projects' | 'inventory' | 'creatives' | 'campaigns'
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly client: PrismaClient
  constructor() {
    if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before starting the gateway.')
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 5000,
    })
    this.client = new PrismaClient({ adapter })
  }
  async transaction<T>(fn: (client: Queryable) => Promise<T>): Promise<T> {
    return this.client.$transaction(fn, { maxWait: 5000, timeout: 30000 })
  }
  async onApplicationShutdown() {
    await this.client.$disconnect()
  }
}
