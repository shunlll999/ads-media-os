import { gatewayResponse } from '@/lib/gateway'
export const dynamic = 'force-dynamic'
export async function GET() {
  return gatewayResponse('/v1/creatives')
}
