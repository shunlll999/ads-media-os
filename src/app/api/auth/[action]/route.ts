import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { gatewayResponse } from '@/lib/gateway'
export const dynamic = 'force-dynamic'
export async function GET(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  if (action !== 'me') return Response.json({ error: 'Not found.' }, { status: 404 })
  return gatewayResponse('/v1/auth/me', request)
}
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  if (!['login', 'logout', 'password'].includes(action))
    return Response.json({ error: 'Not found.' }, { status: 404 })
  const upstream = await gatewayResponse(`/v1/auth/${action}`, request)
  const body = await upstream.json()
  if (action === 'login' && upstream.ok) {
    const { token, ...publicBody } = body
    const response = NextResponse.json(publicBody)
    response.cookies.set('media_os_session', token, {
      httpOnly: true,
      secure: new URL(request.url).protocol === 'https:',
      sameSite: 'strict',
      path: '/',
      maxAge: 7200,
    })
    return response
  }
  if (action === 'logout' || (action === 'password' && upstream.ok))
    (await cookies()).delete('media_os_session')
  return NextResponse.json(body, { status: upstream.status })
}
