// V1.0.0
import { NextRequest, NextResponse } from 'next/server'
import { createSession } from '@/lib/session'

const COOKIE_NAME = 'kjm_session'
const MAX_AGE = 60 * 60 * 24 // 24時間

export async function POST(request: NextRequest) {
  const secret = process.env.SESSION_SECRET
  const appPassword = process.env.APP_PASSWORD
  if (!secret || !appPassword) {
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })
  }

  let password = ''
  try {
    const body = await request.json()
    password = body?.password ?? ''
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です' }, { status: 400 })
  }

  // 仕様どおり平文比較
  if (password !== appPassword) {
    return NextResponse.json({ error: 'パスワードが違います' }, { status: 401 })
  }

  const token = await createSession(secret, MAX_AGE)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: MAX_AGE,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
  return res
}
