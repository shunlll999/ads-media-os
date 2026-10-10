import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common'
import { DeviceGuard, type DeviceRequest, Public } from '../common/security.js'
import { PlayerService } from './player.service.js'
@Public()
@UseGuards(DeviceGuard)
@Controller()
export class PlayerController {
  constructor(private readonly service: PlayerService) {}
  @Get('v1/player/:id/playlist')
  @HttpCode(200)
  getPlayerPlaylist(@Req() request: DeviceRequest) {
    return this.service.getPlayerPlaylist(request.screen)
  }
  @Post('v1/player/:id/heartbeat')
  @HttpCode(200)
  heartbeat(@Req() request: DeviceRequest) {
    return this.service.heartbeat(request.screen)
  }
  @Post('v1/player/:id/plays')
  @HttpCode(200)
  recordPlayback(@Body() body: unknown, @Req() request: DeviceRequest) {
    return this.service.recordPlayback(body, request.screen)
  }
}
