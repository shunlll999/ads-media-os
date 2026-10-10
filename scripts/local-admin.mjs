import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../media-os-gateway/.env', import.meta.url), 'utf8')
const value = (name) => source.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]
if (!value('BOOTSTRAP_ADMIN_EMAIL') || !value('BOOTSTRAP_ADMIN_PASSWORD'))
  throw new Error('Run npm run gateway:setup first.')
console.log('Initial local admin credentials (only valid until changed; keep private):')
console.log(`Email: ${value('BOOTSTRAP_ADMIN_EMAIL')}`)
console.log(`Password: ${value('BOOTSTRAP_ADMIN_PASSWORD')}`)
