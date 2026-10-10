import { gatewayResponse } from '@/lib/gateway'
export const dynamic = 'force-dynamic'
async function handle(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await params
  if (!['playlist', 'heartbeat', 'plays'].includes(action))
    return Response.json({ error: 'Unknown player action.' }, { status: 404 })
  return gatewayResponse(
    `/v1/player/${encodeURIComponent(id)}/${action}`,
    request,
    request.headers.get('x-screen-token') ?? '',
  )
}

export { handle as GET, handle as POST }
