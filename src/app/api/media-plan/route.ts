import { gatewayResponse } from '@/lib/gateway'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  return gatewayResponse('/v1/media-plan', request)
}
