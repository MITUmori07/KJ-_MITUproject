/* ============================================================
ディレクトリ: mitu-project/app/api/keepalive/
ファイル名: route.ts
バージョン: V1.0.0
更新: V1.0.0 feat: Supabase自動停止防止のヘルスチェックAPI新規作成
      Vercel Cronから毎日1回叩かれ、estimatesを1件SELECTして無操作カウントをリセットする
============================================================ */
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const { error } = await supabase.from('estimates').select('id').limit(1)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString() })
}
