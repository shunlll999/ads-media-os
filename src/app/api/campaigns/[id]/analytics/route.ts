import { gatewayResponse } from '@/lib/gateway'
export const dynamic = 'force-dynamic'
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return gatewayResponse(`/v1/campaigns/${encodeURIComponent(id)}/analytics`)
}
