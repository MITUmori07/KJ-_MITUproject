/* ============================================================
ディレクトリ: mitu-project/app/api/keepalive/
ファイル名: route.ts
バージョン: V1.2.1
更新: V1.0.0 feat: Supabase自動停止防止のヘルスチェックAPI新規作成
      Vercel Cronから毎日1回叩かれ、estimatesを1件SELECTして無操作カウントをリセットする
更新: V1.1.0 fix: middlewareの認証対象から外したため、CRON_SECRET設定時のみBearer検証を追加
      （CRON_SECRET未設定なら従来どおり動作する）
更新: V1.2.0 fix: RLS有効化に備え、service_roleキーがあればそちらを使う
      （未設定ならanonキーで従来どおり動作する）
更新: V1.2.1 fix: 環境変数の前後の空白・改行を除去（貼り付け時の混入対策）
============================================================ */
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// RLSを有効にするとanonキーでは行が読めなくなるため、あればservice_roleキーを使う
// 貼り付け時に紛れ込んだ前後の空白・改行を落とす（Invalid API keyの典型原因）
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!).trim()
)

export async function GET(req: Request) {
  // CRON_SECRETをVercelに設定すると、Vercel CronがAuthorization: Bearer <secret>を送る。
  // 未設定の場合は検証しない（DBを1件SELECTするだけのため実害はない）
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const { error } = await supabase.from('estimates').select('id').limit(1)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString() })
}
