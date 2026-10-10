import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import { mergeMap } from 'rxjs'
import type { AuthRequest } from './auth.controller.js'
import { AuthService } from './auth.service.js'
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auth: AuthService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const r = context.switchToHttp().getRequest<AuthRequest>()
    if (
      !r.user ||
      ['GET', 'HEAD', 'OPTIONS'].includes(r.method) ||
      r.path.startsWith('/v1/auth/') ||
      r.path.startsWith('/v1/cms/')
    )
      return next.handle()
    return next.handle().pipe(
      mergeMap(async (data) => {
        await this.auth.audit(r.user, r.method, r.path)
        return data
      }),
    )
  }
}
