import { Global, Module } from '@nestjs/common'
import { DatabaseService } from './database.service.js'
import { GatewayStore } from './gateway-store.service.js'
@Global()
@Module({ providers: [DatabaseService, GatewayStore], exports: [DatabaseService, GatewayStore] })
export class DatabaseModule {}
