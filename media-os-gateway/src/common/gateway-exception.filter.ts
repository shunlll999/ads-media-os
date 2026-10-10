import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common'
import type { Response } from 'express'
import { z } from 'zod'
@Catch()
export class GatewayExceptionFilter implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : error.status ||
          (error instanceof z.ZodError
            ? 400
            : ['P2002', 'P2003'].includes(error.code)
              ? 409
              : error.code === 'P2025'
                ? 404
                : 500)
    if (status >= 500) console.error(error.message)
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({
        error:
          error instanceof z.ZodError
            ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
            : status >= 500
              ? 'Gateway request failed.'
              : error.code === 'P2002'
                ? 'A record with this identity already exists.'
                : error.code === 'P2003'
                  ? 'This record is referenced by another resource. Remove the references first.'
                  : error.code === 'P2025'
                    ? 'Record not found.'
                    : error.message,
      })
  }
}
