import { createHash, timingSafeEqual } from 'node:crypto'
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { AuthService } from '../auth/auth.service.js'
import { DatabaseService } from '../database/database.service.js'
import { record as storedRecord } from '../database/gateway-store.service.js'
import type { StoredRecord } from './contracts.js'
export const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export const same = (a: unknown, b: unknown): boolean =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)))
export const Public = () => SetMetadata('publicGatewayRoute', true)
export interface DeviceRequest extends Request {
  screen: StoredRecord
}
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>('publicGatewayRoute', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true
    const request = context
      .switchToHttp()
      .getRequest<import('../auth/auth.controller.js').AuthRequest>()
    request.user = await this.auth.authenticate(request.headers.authorization)
    this.auth.authorize(request.user, request.path, request.method)
    return true
  }
}
@Injectable()
export class DeviceGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<DeviceRequest>()
    const record = await this.database.client.screen.findUnique({
      where: { id: String(request.params.id) },
    })
    const token = request.headers['x-screen-token']
    if (
      !record ||
      storedRecord(record.payload).archivedAt ||
      typeof token !== 'string' ||
      !same(hash(token), record.tokenHash)
    )
      throw new UnauthorizedException('Screen pairing token is invalid.')
    request.screen = storedRecord(record.payload)
    return true
  }
}
