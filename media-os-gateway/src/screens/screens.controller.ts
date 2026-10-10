import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common'
import { ScreensService } from './screens.service.js'

@Controller()
export class ScreensController {
  constructor(private readonly service: ScreensService) {}
  @Get('v1/screens')
  @HttpCode(200)
  listScreens() {
    return this.service.listScreens()
  }
  @Post('v1/screens')
  @HttpCode(201)
  registerScreen(@Body() body: unknown) {
    return this.service.registerScreen(body)
  }
  @Patch('v1/screens/:id')
  @HttpCode(200)
  updateScreen(@Body() body: unknown, @Param('id') identity: string) {
    return this.service.updateScreen(body, identity)
  }
  @Post('v1/screens/:id/pair')
  @HttpCode(200)
  pairScreen(@Param('id') identity: string) {
    return this.service.pairScreen(identity)
  }
  @Get('v1/screens/:id/playlist')
  @HttpCode(200)
  getPlaylist(@Param('id') identity: string) {
    return this.service.getPlaylist(identity)
  }
  @Put('v1/screens/:id/playlist')
  @HttpCode(200)
  replacePlaylist(@Body() body: unknown, @Param('id') identity: string) {
    return this.service.replacePlaylist(body, identity)
  }
  @Post('v1/deploy')
  @HttpCode(200)
  deployCampaign(@Body() body: unknown) {
    return this.service.deployCampaign(body)
  }
}
