import { randomBytes } from 'node:crypto'
import { chmod, readFile, writeFile } from 'node:fs/promises'

const path = new URL('../media-os-gateway/.env', import.meta.url)
let source = ''
try {
  source = await readFile(path, 'utf8')
} catch {}
const value = (name) => source.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]
const key = value('GATEWAY_API_KEY') || randomBytes(32).toString('hex')
const password = value('POSTGRES_PASSWORD') || randomBytes(20).toString('hex')
if (!value('GATEWAY_API_KEY')) source += `\nGATEWAY_API_KEY=${key}\n`
if (!value('POSTGRES_PASSWORD')) source += `\nPOSTGRES_PASSWORD=${password}\n`
for (const [name, generated] of [
  ['JWT_SECRET', randomBytes(48).toString('hex')],
  ['BOOTSTRAP_ADMIN_EMAIL', 'admin@media-os.local'],
  ['BOOTSTRAP_ADMIN_PASSWORD', randomBytes(18).toString('base64url')],
])
  if (!value(name)) source += `\n${name}=${generated}\n`
if (!value('SEED_DEMO')) source += 'SEED_DEMO=true\n'
await writeFile(path, source, { mode: 0o600 })
await chmod(path, 0o600)
const frontend = new URL('../.env.local', import.meta.url)
let env = ''
try {
  env = await readFile(frontend, 'utf8')
} catch {}
for (const [name, v] of [
  ['MEDIA_OS_GATEWAY_URL', `http://127.0.0.1:${value('GATEWAY_PORT') || 4000}`],
  ['MEDIA_OS_GATEWAY_API_KEY', key],
]) {
  const pattern = new RegExp(`^${name}=.*$`, 'm')
  env = pattern.test(env) ? env.replace(pattern, `${name}=${v}`) : `${env}\n${name}=${v}\n`
}
await writeFile(frontend, env, { mode: 0o600 })
await chmod(frontend, 0o600)
console.log(
  'Gateway and frontend environment configured. Credentials are stored locally, not printed.',
)
