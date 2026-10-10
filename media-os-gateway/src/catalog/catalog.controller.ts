import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common'
import { CatalogService } from './catalog.service.js'

@Controller()
export class CatalogController {
  constructor(private readonly service: CatalogService) {}
  @Get('v1/projects')
  @HttpCode(200)
  listProjects() {
    return this.service.listProjects()
  }
  @Post('v1/projects')
  @HttpCode(201)
  saveProject(@Body() body: unknown) {
    return this.service.saveProject(body)
  }
  @Post('v1/projects/:id/sync')
  @HttpCode(200)
  syncProject(@Param('id') identity: string) {
    return this.service.syncProject(identity)
  }
  @Get('v1/media')
  @HttpCode(200)
  listInventory(@Query() query: Record<string, unknown>) {
    return this.service.listInventory(query)
  }
  @Get('v1/media/:id')
  @HttpCode(200)
  getInventory(@Param('id') identity: string) {
    return this.service.getInventory(identity)
  }
  @Post('v1/media')
  @HttpCode(201)
  saveInventory(@Body() body: unknown) {
    return this.service.saveInventory(body)
  }
  @Post('v1/media-plan')
  @HttpCode(201)
  recommendPlan(@Body() body: unknown) {
    return this.service.recommendPlan(body)
  }
  @Get('v1/creatives')
  @HttpCode(200)
  listCreatives() {
    return this.service.listCreatives()
  }
  @Post('v1/creatives')
  @HttpCode(201)
  createCreative(@Body() body: unknown) {
    return this.service.createCreative(body)
  }
  @Post('v1/creatives/upload')
  @HttpCode(201)
  uploadCreative(
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.service.uploadCreative(body, headers)
  }
  @Post('v1/import')
  @HttpCode(200)
  importCatalog(@Body() body: unknown) {
    return this.service.importCatalog(body)
  }
  @Get('v1/export')
  @HttpCode(200)
  exportCatalog() {
    return this.service.exportCatalog()
  }
}
