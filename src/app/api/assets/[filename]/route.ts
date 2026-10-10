import { gatewayResponse } from '@/lib/gateway'
export const dynamic = 'force-dynamic'
export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params
  if (!/^[a-f0-9-]+\.(png|jpg|webp|gif|mp4|webm)$/.test(filename))
    return Response.json({ error: 'Invalid asset.' }, { status: 400 })
  return gatewayResponse(`/uploads/${filename}`, request)
}
