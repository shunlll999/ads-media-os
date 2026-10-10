import { Module } from '@nestjs/common'
import { CampaignsController } from './campaigns.controller.js'
import { CampaignsService } from './campaigns.service.js'
@Module({ controllers: [CampaignsController], providers: [CampaignsService] })
export class CampaignsModule {}
