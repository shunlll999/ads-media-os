import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { MockSspAdapter } from './mock-ssp.adapter.js'
import { ProgrammaticService } from './programmatic.service.js'
@Controller('v1/programmatic')
export class ProgrammaticController {
  constructor(private readonly service: ProgrammaticService) {}
  @Post('demo') @HttpCode(200) demo() {
    return this.service.demo()
  }
  @Get('deals') deals() {
    return this.service.records('deal')
  }
  @Post('deals') create(@Body() body: unknown) {
    return this.service.createDeal(body)
  }
  @Patch('deals/:id') update(@Param('id') id: string, @Body() body: unknown) {
    return this.service.updateDeal(id, body)
  }
  @Delete('deals/:id') remove(@Param('id') id: string) {
    return this.service.removeDeal(id)
  }
  @Patch('transactions/:id') editTransaction(@Param('id') id: string, @Body() body: unknown) {
    return this.service.editTransaction(id, body)
  }
  @Delete('transactions/:id') removeTransaction(@Param('id') id: string) {
    return this.service.removeTransaction(id)
  }
  @Post('deals/:id/status') @HttpCode(200) status(@Param('id') id: string, @Body() body: unknown) {
    return this.service.status(id, body)
  }
  @Get('screens') screens() {
    return this.service.profiles()
  }
  @Post('screens/:id/profile') @HttpCode(200) profile(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.profile(id, body)
  }
  @Post('screens/:id/test') @HttpCode(200) test(@Param('id') id: string) {
    return this.service.testScreen(id)
  }
  @Post('screens/:id/enable') @HttpCode(200) enable(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.enable(id, body)
  }
  @Get('connections') connections() {
    return this.service.connections()
  }
  @Post('connections') createConnection(@Body() body: unknown) {
    return this.service.saveConnection(undefined, body)
  }
  @Patch('connections/:id') updateConnection(@Param('id') id: string, @Body() body: unknown) {
    return this.service.saveConnection(id, body)
  }
  @Delete('connections/:id') removeConnection(@Param('id') id: string) {
    return this.service.removeConnection(id)
  }
  @Delete('screens/:id/profile') removeProfile(@Param('id') id: string) {
    return this.service.removeProfile(id)
  }
  @Post('connections/sync') @HttpCode(200) sync(@Body() body: unknown) {
    return this.service.sync(body)
  }
  @Post('connections/disconnect') @HttpCode(200) disconnect(@Body() body: unknown) {
    return this.service.disconnect(body)
  }
  @Get('transactions') transactions(
    @Query('page') page: string,
    @Query('dealId') dealId: string,
    @Query('source') source: string,
  ) {
    return this.service.transactions({ page, dealId, source })
  }
  @Post('transactions') @HttpCode(200) ingest(@Body() body: unknown) {
    return this.service.ingest(body)
  }
  @Post('deals/:id/simulate') @HttpCode(200) simulate(@Param('id') id: string) {
    return this.service.simulate(id)
  }
  @Get('deals/:id/metrics') metrics(@Param('id') id: string, @Query('period') period: string) {
    return this.service.metrics(id, period)
  }
  @Get('operations') operations() {
    return this.service.operations()
  }
  @Get('commercial') commercial(@Query('month') month: string) {
    return this.service.commercial(undefined, month)
  }
  @Delete('commercial/target') resetTarget(@Query('month') month: string) {
    return this.service.resetCommercialTarget(month)
  }
  @Post('commercial/target') @HttpCode(200) target(@Body() body: unknown) {
    return this.service.commercial(body)
  }
  @Post('deals/:id/commercial') @HttpCode(200) stage(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.commercialStage(id, body)
  }
}
@Module({
  controllers: [ProgrammaticController],
  providers: [ProgrammaticService, MockSspAdapter],
  exports: [ProgrammaticService],
})
export class ProgrammaticModule {}
