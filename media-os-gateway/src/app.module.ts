import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { AuditInterceptor } from './auth/audit.interceptor.js'
import { AuthModule } from './auth/auth.controller.js'
import { CampaignsModule } from './campaigns/campaigns.module.js'
import { CatalogModule } from './catalog/catalog.module.js'
import { CmsModule } from './cms/cms.controller.js'
import { GatewayExceptionFilter } from './common/gateway-exception.filter.js'
import { DeviceGuard, JwtGuard } from './common/security.js'
import { DatabaseModule } from './database/database.module.js'
import { HealthController } from './health/health.controller.js'
import { PlayerModule } from './player/player.module.js'
import { ProgrammaticModule } from './programmatic/programmatic.controller.js'
import { ScreensModule } from './screens/screens.module.js'
import { WorkspaceModule } from './workspace/workspace.controller.js'
@Module({
  imports: [
    WorkspaceModule,
    DatabaseModule,
    AuthModule,
    CmsModule,
    CatalogModule,
    CampaignsModule,
    ScreensModule,
    PlayerModule,
    ProgrammaticModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    JwtGuard,
    DeviceGuard,
    { provide: APP_GUARD, useExisting: JwtGuard },
    { provide: APP_FILTER, useClass: GatewayExceptionFilter },
  ],
})
export class AppModule {}
