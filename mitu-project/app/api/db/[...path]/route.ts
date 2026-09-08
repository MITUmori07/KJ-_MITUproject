/* ============================================================
ディレクトリ: mitu-project/app/api/db/[...path]/
ファイル名: route.ts
バージョン: V1.0.1
更新: V1.0.0 feat: Supabase REST APIのサーバー側プロキシを新規作成
      ブラウザは公開キー(anon)でSupabaseを直接叩かず、必ずこのAPIを経由する。
      このAPIはmiddlewareのログイン認証で保護されており、
      Supabaseへはサーバーだけが持つservice_roleキーで問い合わせる。
      これによりテーブルのRLSをポリシーなしで有効化しても
      アプリは従来どおり動作し、外部からは一切アクセスできなくなる。
更新: V1.0.1 fix: 環境変数の前後の空白・改行を除去（貼り付け時の混入対策）。
      鍵が拒否された場合はサーバーログに理由が残るようにした。
============================================================ */
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 中継を許可するパス（PostgRESTのみ。authやstorageは通さない）
const ALLOWED_PREFIX = 'rest/v1/'

// ブラウザ→このAPI へ引き継ぐヘッダー（PostgRESTの動作に必要なものだけ）
const FORWARD_REQUEST_HEADERS = [
  'content-type',
  'prefer',
  'accept',
  'accept-profile',
  'content-profile',
  'range',
  'range-unit',
]

// Supabase→ブラウザ へ返すヘッダー（件数取得などに必要）
const FORWARD_RESPONSE_HEADERS = [
  'content-type',
  'content-range',
  'range-unit',
  'preference-applied',
]

const deny = (message: string, status: number) =>
  NextResponse.json({ message, code: 'proxy_error' }, { status })

async function proxy(req: NextRequest, path: string[]) {
  // 貼り付け時に紛れ込んだ前後の空白・改行を落とす（Invalid API keyの典型原因）
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  // service_roleキーは絶対にNEXT_PUBLIC_を付けないこと（付けるとブラウザに露出する）
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!supabaseUrl || !serviceKey) {
    console.error('[api/db] SUPABASE_SERVICE_ROLE_KEY または NEXT_PUBLIC_SUPABASE_URL が未設定です')
    return deny('サーバー設定エラー', 500)
  }

  // '..' を含むパスでrest/v1の外へ抜けられないようにする
  if (path.some(seg => seg === '.' || seg === '..' || seg.includes('\\'))) {
    return deny('許可されていないパスです', 403)
  }
  const target = path.join('/')
  if (!target.startsWith(ALLOWED_PREFIX)) {
    return deny('許可されていないパスです', 403)
  }

  const url = `${supabaseUrl.replace(/\/$/, '')}/${target}${req.nextUrl.search}`

  const headers = new Headers()
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name)
    if (value) headers.set(name, value)
  }
  // ブラウザから来たapikey/Authorizationは使わず、必ずサーバーの鍵で上書きする
  headers.set('apikey', serviceKey)
  headers.set('Authorization', `Bearer ${serviceKey}`)

  const method = req.method
  const body = method === 'GET' || method === 'HEAD' ? undefined : await req.arrayBuffer()

  let upstream: Response
  try {
    upstream = await fetch(url, { method, headers, body, cache: 'no-store' })
  } catch (e) {
    console.error('[api/db] upstream error:', e)
    return deny('データベースに接続できませんでした', 502)
  }

  if (upstream.status === 401) {
    console.error('[api/db] Supabaseが鍵を拒否しました。SUPABASE_SERVICE_ROLE_KEYの値を確認してください')
  }

  const resHeaders = new Headers()
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) resHeaders.set(name, value)
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers: resHeaders })
}

type Ctx = { params: Promise<{ path: string[] }> }
const handler = async (req: NextRequest, ctx: Ctx) => proxy(req, (await ctx.params).path)

export const GET = handler
export const POST = handler
export const PATCH = handler
export const PUT = handler
export const DELETE = handler
export const HEAD = handler
