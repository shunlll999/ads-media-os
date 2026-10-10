import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common'
import { CampaignsService } from './campaigns.service.js'

@Controller()
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}
  @Get('v1/campaigns')
  @HttpCode(200)
  listCampaigns() {
    return this.service.listCampaigns()
  }
  @Post('v1/campaigns')
  @HttpCode(201)
  createCampaign(@Body() body: unknown) {
    return this.service.createCampaign(body)
  }
  @Patch('v1/campaigns/:id') update(@Body() body: unknown, @Param('id') id: string) {
    return this.service.editCampaign(body, id)
  }
  @Delete('v1/campaigns/:id') remove(@Param('id') id: string) {
    return this.service.removeCampaign(id)
  }
  @Get('v1/campaigns/:id')
  @HttpCode(200)
  getCampaign(@Param('id') identity: string) {
    return this.service.getCampaign(identity)
  }
  @Post('v1/campaigns/:id/status')
  @HttpCode(200)
  updateStatus(@Body() body: unknown, @Param('id') identity: string) {
    return this.service.updateStatus(body, identity)
  }
  @Get('v1/campaigns/:id/analytics')
  @HttpCode(200)
  analytics(@Param('id') identity: string) {
    return this.service.analytics(identity)
  }
}
