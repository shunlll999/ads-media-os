import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import express from 'express'
import { AppModule } from './app.module.js'
import { AuthService } from './auth/auth.service.js'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false })
  app.getHttpAdapter().getInstance().disable('x-powered-by')
  app.use((_request: express.Request, response: express.Response, next: express.NextFunction) => {
    response.set('X-Content-Type-Options', 'nosniff')
    response.set('Cache-Control', 'no-store')
    next()
  })
  const raw = express.raw({ type: () => true, limit: '100mb' }),
    json = express.json({ limit: '2mb' })
  const auth = app.get(AuthService)
  app.use(
    async (request: express.Request, response: express.Response, next: express.NextFunction) => {
      if (request.path === '/v1/creatives/upload' && request.method === 'POST') {
        try {
          const user = await auth.authenticate(request.headers.authorization)
          auth.authorize(user, request.path, request.method)
        } catch (error) {
          const e = error as { status?: number; message: string }
          response.status(e.status ?? 401).json({ error: e.message })
          return
        }
        raw(request, response, next)
      } else json(request, response, next)
    },
  )
  app.use(
    '/uploads',
    express.static('/app/uploads', {
      dotfiles: 'deny',
      setHeaders: (response) => response.set('Cache-Control', 'public, max-age=86400'),
    }),
  )
  app.enableShutdownHooks()
  await app.listen(Number(process.env.PORT || 4000), '0.0.0.0')
}
bootstrap().catch((error) => {
  console.error('Gateway startup failed:', error.message)
  process.exitCode = 1
})
