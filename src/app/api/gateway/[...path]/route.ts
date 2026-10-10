import { gatewayResponse } from '@/lib/gateway'
export const dynamic = 'force-dynamic'
async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  if (
    ![
      'workspace',
      'cms',
      'auth',
      'programmatic',
      'projects',
      'media',
      'creatives',
      'screens',
      'campaigns',
      'deploy',
      'import',
      'export',
    ].includes(path[0])
  )
    return Response.json({ error: 'Unknown gateway resource.' }, { status: 404 })
  return gatewayResponse(
    `/v1/${path.map(encodeURIComponent).join('/')}${new URL(request.url).search}`,
    request,
  )
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE }
