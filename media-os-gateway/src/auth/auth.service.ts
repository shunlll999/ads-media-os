import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { Injectable, OnApplicationBootstrap } from '@nestjs/common'
import { jwtVerify, SignJWT } from 'jose'
import { z } from 'zod'
import { fail } from '../common/contracts.js'
import { DatabaseService } from '../database/database.service.js'

const scrypt = promisify(scryptCallback)
export const roles = ['admin', 'editor', 'operator', 'commercial', 'viewer'] as const
export const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(128),
})
const publicUser = (u: {
  id: string
  email: string
  name: string
  role: string
  active: boolean
}) => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active })
export type Identity = ReturnType<typeof publicUser> & { sessionId: string }
async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${((await scrypt(password, salt, 64)) as Buffer).toString('hex')}`
}
async function passwordMatches(password: string, stored: string) {
  const [salt, digest] = stored.split(':')
  const hash = (await scrypt(password, salt, 64)) as Buffer
  const expected = Buffer.from(digest, 'hex')
  return hash.length === expected.length && timingSafeEqual(hash, expected)
}
@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly key: Uint8Array
  constructor(readonly db: DatabaseService) {
    const secret = process.env.JWT_SECRET
    if (!secret || secret.length < 32) throw new Error('Set JWT_SECRET to at least 32 characters.')
    this.key = new TextEncoder().encode(secret)
  }
  async onApplicationBootstrap() {
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL,
      password = process.env.BOOTSTRAP_ADMIN_PASSWORD
    if (!email || !password) return
    const input = credentials.parse({ email, password })
    const hash = await passwordHash(input.password)
    await this.db.transaction(async (c) => {
      await c.$queryRaw`SELECT pg_advisory_xact_lock(804027)::text`
      if (await c.user.count()) return
      await c.user.create({
        data: {
          id: crypto.randomUUID(),
          email: input.email,
          name: process.env.BOOTSTRAP_ADMIN_NAME || 'Administrator',
          passwordHash: hash,
          role: 'admin',
        },
      })
    })
  }
  async login(body: unknown) {
    const input = credentials.parse(body)
    const user = await this.db.client.user.findUnique({ where: { email: input.email } })
    if (user?.lockedUntil && user.lockedUntil > new Date())
      fail('Sign-in temporarily locked. Try again in 15 minutes.', 429)
    const valid = await passwordMatches(
      input.password,
      user?.passwordHash ?? `00000000000000000000000000000000:${'00'.repeat(64)}`,
    )
    if (!user?.active || !valid) {
      if (user)
        await this.db.client.user.update({
          where: { id: user.id },
          data: {
            failedAttempts: { increment: 1 },
            ...(user.failedAttempts >= 4 ? { lockedUntil: new Date(Date.now() + 900000) } : {}),
          },
        })
      fail('Invalid email or password.', 401)
    }
    await this.db.client.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    })
    const sessionId = crypto.randomUUID(),
      expiresAt = new Date(Date.now() + 7200000)
    await this.db.client.authSession.deleteMany({ where: { expiresAt: { lt: new Date() } } })
    await this.db.client.authSession.create({ data: { id: sessionId, userId: user.id, expiresAt } })
    const token = await new SignJWT({ role: user.role, version: user.authVersion })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setJti(sessionId)
      .setIssuer('media-os-gateway')
      .setAudience('media-os')
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(this.key)
    return { token, user: publicUser(user), expiresAt }
  }
  async authenticate(authorization: unknown): Promise<Identity> {
    try {
      if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) throw Error()
      const { payload } = await jwtVerify(authorization.slice(7), this.key, {
        algorithms: ['HS256'],
        issuer: 'media-os-gateway',
        audience: 'media-os',
      })
      if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') throw Error()
      const session = await this.db.client.authSession.findUnique({
        where: { id: payload.jti },
        include: { user: true },
      })
      if (
        !session ||
        session.userId !== payload.sub ||
        session.expiresAt < new Date() ||
        !session.user.active ||
        session.user.authVersion !== payload.version
      )
        throw Error()
      return { ...publicUser(session.user), sessionId: session.id }
    } catch {
      fail('Sign in required or session expired.', 401)
    }
  }
  authorize(user: Identity, path: string, method: string) {
    path = path.toLowerCase()
    if (user.role === 'admin') return
    if (path.startsWith('/v1/workspace/')) {
      const resource = path.split('/')[3],
        read = ['GET', 'HEAD', 'OPTIONS'].includes(method)
      const roles = ['proposals', 'invoices', 'reports'].includes(resource)
        ? ['commercial']
        : ['audience', 'sources'].includes(resource)
          ? read
            ? ['editor', 'operator']
            : ['editor']
          : resource === 'issues'
            ? read
              ? ['editor', 'operator', 'commercial', 'viewer']
              : ['operator']
            : []
      if (!roles.includes(user.role)) fail('Your role cannot access this resource.', 403)
      return
    }
    if (
      path.startsWith('/v1/cms/records/screens') &&
      user.role === 'operator' &&
      method === 'DELETE'
    )
      return

    if (path.startsWith('/v1/auth/users') || path.startsWith('/v1/cms/audit'))
      fail('Admin role required.', 403)
    if (
      /^\/v1\/programmatic\/(commercial(?:\/|$)|deals\/[^/]+\/commercial(?:\/|$))/.test(path) &&
      user.role !== 'commercial'
    )
      fail('Commercial role required.', 403)
    if ((path.startsWith('/v1/cms/records') || path === '/v1/export') && user.role !== 'editor')
      fail('Editor role required.', 403)
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return
    if (path.startsWith('/v1/auth/') || path.startsWith('/v1/cms/draft')) return
    if (path === '/v1/media-plan' && user.role !== 'viewer') return
    const allowed = path.startsWith('/v1/cms/')
      ? ['editor']
      : /\/v1\/(projects|media|creatives|import)/.test(path)
        ? ['editor']
        : /\/commercial|\/payment|\/target/.test(path)
          ? ['commercial']
          : /\/v1\/(campaigns|screens|deploy|programmatic)/.test(path)
            ? ['operator']
            : []
    if (!allowed.includes(user.role)) fail('Your role cannot perform this action.', 403)
  }
  async audit(user: Identity, action: string, resource: string) {
    await this.db.client.auditLog.create({
      data: { id: crypto.randomUUID(), userId: user.id, action, resource },
    })
  }
  async logout(user: Identity) {
    await this.db.client.authSession.deleteMany({ where: { id: user.sessionId } })
    return { ok: true }
  }
  async changePassword(user: Identity, body: unknown) {
    const b = z
      .object({ currentPassword: z.string().max(128), password: z.string().min(12).max(128) })
      .parse(body)
    const row = await this.db.client.user.findUniqueOrThrow({ where: { id: user.id } })
    if (!(await passwordMatches(b.currentPassword, row.passwordHash)))
      fail('Current password is incorrect.', 400)
    await this.db.client.user.update({
      where: { id: user.id },
      data: { passwordHash: await passwordHash(b.password), authVersion: { increment: 1 } },
    })
    await this.audit(user, 'password.change', user.id)
    return { ok: true }
  }
  async users() {
    return {
      data: (await this.db.client.user.findMany({ orderBy: { createdAt: 'asc' }, take: 100 })).map(
        publicUser,
      ),
    }
  }
  async createUser(user: Identity, body: unknown) {
    const b = credentials
      .extend({ name: z.string().trim().min(1).max(100), role: z.enum(roles) })
      .parse(body)
    const row = await this.db.client.user.create({
      data: {
        id: crypto.randomUUID(),
        email: b.email,
        name: b.name,
        role: b.role,
        passwordHash: await passwordHash(b.password),
      },
    })
    await this.audit(user, 'user.create', row.id)
    return publicUser(row)
  }
  async updateUser(actor: Identity, id: string, body: unknown) {
    z.uuid().parse(id)
    const b = z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        role: z.enum(roles).optional(),
        active: z.boolean().optional(),
        password: z.string().min(12).max(128).optional(),
      })
      .strict()
      .parse(body)
    const result = await this.db.transaction(async (c) => {
      await c.$queryRaw`SELECT pg_advisory_xact_lock(804028)::text`
      const current = await c.user.findUnique({ where: { id } })
      if (!current) fail('User not found.', 404)
      if (
        current.role === 'admin' &&
        current.active &&
        ((b.role && b.role !== 'admin') || b.active === false) &&
        (await c.user.count({ where: { role: 'admin', active: true } })) <= 1
      )
        fail('Keep at least one active admin.', 409)
      return c.user.update({
        where: { id },
        data: {
          name: b.name,
          role: b.role,
          active: b.active,
          ...(b.password ? { passwordHash: await passwordHash(b.password) } : {}),
          authVersion: { increment: 1 },
        },
      })
    })
    await this.audit(actor, 'user.update', id)
    return publicUser(result)
  }
}
