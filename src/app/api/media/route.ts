import { gatewayResponse } from '@/lib/gateway'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  return gatewayResponse(`/v1/media${new URL(request.url).search}`)
}
