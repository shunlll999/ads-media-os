import 'server-only'
import { cookies } from 'next/headers'

export const gatewayEnabled = Boolean(process.env.MEDIA_OS_GATEWAY_URL)
export async function gatewayResponse(path: string, request?: Request, deviceToken?: string) {
  const base = process.env.MEDIA_OS_GATEWAY_URL
  if (!base)
    return Response.json(
      { error: 'Start media-os-gateway and configure MEDIA_OS_GATEWAY_URL.' },
      { status: 503 },
    )
  try {
    const method = request?.method ?? 'GET'
    const headers = new Headers()
    if (deviceToken !== undefined) headers.set('x-screen-token', deviceToken)
    else {
      const token = (await cookies()).get('media_os_session')?.value
      if (token) headers.set('Authorization', `Bearer ${token}`)
    }
    if (request?.headers.get('content-type'))
      headers.set('content-type', request.headers.get('content-type') ?? '')
    if (request?.headers.get('x-file-name'))
      headers.set('x-file-name', request.headers.get('x-file-name') ?? '')
    if (request?.headers.get('range')) headers.set('range', request.headers.get('range') ?? '')
    const body =
      request && !['GET', 'HEAD'].includes(method) ? await request.arrayBuffer() : undefined
    if (body && body.byteLength > 100 * 1024 * 1024)
      return Response.json({ error: 'Maximum upload size is 100MB.' }, { status: 413 })
    const upstream = await fetch(`${base}${path}`, {
      method,
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    const responseHeaders = new Headers()
    for (const name of ['content-range', 'accept-ranges', 'content-length']) {
      const value = upstream.headers.get(name)
      if (value) responseHeaders.set(name, value)
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...Object.fromEntries(responseHeaders),
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return Response.json(
      { error: 'Gateway is unavailable. Check Docker and gateway configuration.' },
      { status: 503 },
    )
  }
}
