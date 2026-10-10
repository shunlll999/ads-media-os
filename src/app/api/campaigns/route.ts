import { gatewayResponse } from '@/lib/gateway'
export const dynamic = 'force-dynamic'
export async function GET() {
  return gatewayResponse('/v1/campaigns')
}
export async function POST(request: Request) {
  return gatewayResponse('/v1/campaigns', request)
}
