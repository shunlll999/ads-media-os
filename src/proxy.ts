import { type NextRequest, NextResponse } from 'next/server'
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const publicRoute =
    path === '/login' ||
    path.startsWith('/api/auth/') ||
    path.startsWith('/player/') ||
    path.startsWith('/api/player/') ||
    path.startsWith('/api/assets/')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !path.startsWith('/api/player/')) {
    const origin = request.headers.get('origin')
    let sameOrigin = false
    try {
      const supplied = new URL(origin ?? '')
      sameOrigin =
        supplied.host === (request.headers.get('host') ?? request.nextUrl.host) &&
        supplied.protocol ===
          `${request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.slice(0, -1)}:`
    } catch {}
    if (!sameOrigin)
      return Response.json({ error: 'Same-origin request required.' }, { status: 403 })
  }
  if (!publicRoute && !request.cookies.get('media_os_session')) {
    if (path.startsWith('/api/'))
      return Response.json({ error: 'Sign in required.' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', request.url))
  }
  const response = NextResponse.next()
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
export const config = {
  matcher: ['/((?!_next/|favicon.ico|assets/|areas/|projects/).*)'],
}
