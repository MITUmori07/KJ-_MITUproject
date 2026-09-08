// V1.1.0
// 更新: V1.1.0 fix: /api/keepalive を認証対象から除外（Vercel Cronはセッションを持たず
//                   /loginへリダイレクトされ、Supabase自動停止防止が働いていなかった）
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySession } from '@/lib/session'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/keepalive') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')

  if (isPublic) return NextResponse.next()

  const secret = process.env.SESSION_SECRET ?? ''
  const session = request.cookies.get('kjm_session')?.value

  if (!(await verifySession(secret, session))) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
