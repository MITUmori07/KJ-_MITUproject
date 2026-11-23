/* ============================================================
ディレクトリ: mitu-project/app/api/keepalive/
ファイル名: route.ts
バージョン: V1.3.0
更新: V1.0.0 feat: Supabase自動停止防止のヘルスチェックAPI新規作成
      Vercel Cronから毎日1回叩かれ、estimatesを1件SELECTして無操作カウントをリセットする
更新: V1.1.0 fix: middlewareの認証対象から外したため、CRON_SECRET設定時のみBearer検証を追加
      （CRON_SECRET未設定なら従来どおり動作する）
更新: V1.2.0 fix: RLS有効化に備え、service_roleキーがあればそちらを使う
      （未設定ならanonキーで従来どおり動作する）
更新: V1.2.1 fix: 環境変数の前後の空白・改行を除去（貼り付け時の混入対策）
更新: V1.3.0 fix: 1件SELECTだけでは「DB利用あり」と見なされず停止予告が届いたため、
      主要7テーブルを順に読むよう変更。GitHub Actions（1日4回）からも呼ばれる。読み取りのみ
============================================================ */
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// アプリで使っている主要テーブル（from('...') の出現回数順）
const TABLES = [
  'estimates',
  'estimate_items',
  'drafts',
  'buildings',
  'settings',
  'items',
  'item_prices',
]

// RLSを有効にするとanonキーでは行が読めなくなるため、あればservice_roleキーを使う
// 貼り付け時に紛れ込んだ前後の空白・改行を落とす（Invalid API keyの典型原因）
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SUPABASE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''
).trim()

export async function GET(req: Request) {
  // CRON_SECRETをVercelに設定すると、Vercel CronがAuthorization: Bearer <secret>を送る。
  // 未設定の場合は検証しない（読み取りのみのため実害はない）
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const results: Record<string, string> = {}
  for (const t of TABLES) {
    // head: true は件数だけ数えて行データは返さない（DBへの問い合わせは届く）
    const { error } = await supabase.from(t).select('*', { count: 'exact', head: true })
    results[t] = error ? `error: ${error.message}` : 'ok'
  }
  const ok = Object.values(results).some((r) => r === 'ok')
  return NextResponse.json(
    { ok, results, at: new Date().toISOString() },
    { status: ok ? 200 : 500 }
  )
}
