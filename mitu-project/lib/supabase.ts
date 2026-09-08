// ============================================================
// ディレクトリ: mitu-project/lib/
// ファイル名: supabase.ts
// バージョン: V2.0.0
// 更新: V2.0.0 fix: ブラウザからSupabaseを直接叩くのをやめ、
//                   同一オリジンの /api/db 経由（サーバーのservice_roleキー）に変更。
//                   公開キー(anon)はブラウザに配布されなくなり、
//                   テーブルのRLSをポリシーなしで有効化できる。
//                   呼び出し側（supabase.from(...)）は一切変更不要。
// ============================================================
import { createClient } from '@supabase/supabase-js'

// supabase-jsは <base>/rest/v1/... へリクエストする。
// baseを /api/db にしておくと /api/db/rest/v1/... となり、
// app/api/db/[...path]/route.ts が受けてSupabaseへ中継する。
// （このAPIはmiddlewareのログイン認証で保護されている）
const PROXY_PATH = '/api/db'

// SSR/プリレンダー時はwindowが無いためダミーの絶対URLを使う。
// 実際の問い合わせはブラウザのuseEffect内でしか走らないので影響はない。
const baseUrl =
  typeof window === 'undefined' ? `http://localhost${PROXY_PATH}` : `${window.location.origin}${PROXY_PATH}`

// 鍵は/api/db側でservice_roleキーに差し替えられるため、ここでは渡さない。
// （supabase-jsが引数を必須とするためのプレースホルダ）
export const supabase = createClient(baseUrl, 'proxied-by-api-db')
