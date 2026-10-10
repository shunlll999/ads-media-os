import { Controller, Get } from '@nestjs/common'
import { Public } from '../common/security.js'
import { DatabaseService } from '../database/database.service.js'
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}
  @Get()
  async check() {
    await this.database.client.$queryRaw`SELECT 1`
    return { status: 'ok', database: 'postgresql' }
  }
}
