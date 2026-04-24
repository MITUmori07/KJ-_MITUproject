// ============================================================
// ファイル: mitu-project/app/page.tsx
// バージョン: V0.3.1
// 更新: 2026/04/24
// 変更: mode=copy時のdrafts遅延作成対応(sessionStorage経由)
// ============================================================
'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const VERSION = 'V0.3.1'

type Draft = {
  id: number
  file_key: string
  date: string
  building: string
  title: string
  staff: string
  work_type: string
  updated_at: string
}

function HomePage() {
  const router = useRouter()
  const params = useSearchParams()
  const mode = params.get('mode') || 'new'
  const draft_id = params.get('draft_id') || ''
  const isCopy = mode === 'copy'

  const [form, setForm] = useState({
    date: '',
    building: params.get('building') || '',
    title: '',
    staff: params.get('staff') || '',
    work_type: params.get('work_type') || 'C工事',
  })
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [copyDataReady, setCopyDataReady] = useState(false)
  const buildings = ['新宿FT', '新宿ESS']
  const work_types = ['A工事', 'B工事', 'C工事']

  useEffect(() => {
    if (!isCopy) {
      loadDrafts()
    } else {
      // mode=copyのときsessionStorageの存在確認
      try {
        const raw = sessionStorage.getItem('kjm_copy_draft')
        if (!raw) {
          alert('コピーデータが見つかりません。過去見積一覧からやり直してください')
          router.push('/history')
          return
        }
        setCopyDataReady(true)
      } catch (e) {
        alert('コピーデータの読み込みに失敗しました')
        router.push('/history')
      }
    }
  }, [])

  const loadDrafts = async () => {
    const { data } = await supabase
      .from('drafts')
      .select('id,file_key,date,building,title,staff,work_type,updated_at')
      .order('updated_at', { ascending: false })
      .limit(20)
    setDrafts(data || [])
  }

  const handleSubmit = async () => {
    if (!form.date || !form.building || !form.title || !form.staff) {
      alert('全項目入力してください')
      return
    }

    if (isCopy) {
      // sessionStorageからsections取り出してdraftsにinsert
      setSubmitting(true)
      try {
        const raw = sessionStorage.getItem('kjm_copy_draft')
        if (!raw) {
          alert('コピーデータが見つかりません。過去見積一覧からやり直してください')
          setSubmitting(false)
          router.push('/history')
          return
        }
        const copyData = JSON.parse(raw)
        const file_key = `copy_${copyData.source_estimate_id}_${Date.now()}`
        const { data, error } = await supabase.from('drafts').insert({
          file_key,
          date: form.date,
          building: form.building,
          title: form.title,
          staff: form.staff,
          work_type: form.work_type,
          sections: copyData.sections,
          updated_at: new Date().toISOString()
        }).select('id').single()

        if (error || !data) {
          alert('コピー保存に失敗しました')
          setSubmitting(false)
          return
        }

        // 成功したらsessionStorageクリア
        sessionStorage.removeItem('kjm_copy_draft')

        const p = new URLSearchParams({ ...form, draft_id: String(data.id) })
        router.push(`/estimate?${p.toString()}`)
      } catch (e) {
        alert('コピー処理でエラーが発生しました')
        setSubmitting(false)
      }
    } else {
      // 通常の新規作成・下書き編集
      const p = new URLSearchParams({ ...form, ...(draft_id ? { draft_id } : {}) })
      router.push(`/estimate?${p.toString()}`)
    }
  }

  const handleLoad = (draft: Draft) => {
    const p = new URLSearchParams({
      date: draft.date, building: draft.building, title: draft.title,
      staff: draft.staff, work_type: draft.work_type, draft_id: String(draft.id)
    })
    router.push(`/estimate?${p.toString()}`)
  }

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('削除しますか？')) return
    await supabase.from('drafts').delete().eq('id', id)
    loadDrafts()
  }

  const handleBackToHistory = () => {
    // sessionStorageはそのまま残す(戻ってきたときに復元できるように)
    router.push('/history')
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold mb-2 text-gray-800">
        見積作成システム
        <span className="text-xs text-gray-400 font-mono font-normal ml-2">{VERSION}</span>
      </h1>
      {isCopy && (
        <div className="mb-6 bg-orange-50 border border-orange-200 rounded px-4 py-2 text-sm text-orange-700 font-medium">
          📋 明細コピー編集 — 日付と件名を入力してください
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-700">
            {isCopy ? '案件情報入力' : '新規作成'}
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              日付 {isCopy && <span className="text-orange-500">※必須入力</span>}
            </label>
            <input type="date" className="w-full border rounded px-3 py-2"
              value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ビル名</label>
            <select className="w-full border rounded px-3 py-2"
              value={form.building} onChange={e => setForm({...form, building: e.target.value})}>
              <option value="">選択してください</option>
              {buildings.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              件名 {isCopy && <span className="text-orange-500">※必須入力</span>}
            </label>
            <input type="text" className="w-full border rounded px-3 py-2"
              value={form.title} onChange={e => setForm({...form, title: e.target.value})}
              placeholder="17階1701区外原状回復工事" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              担当者 <span className="text-xs text-gray-400 font-normal">フリー入力で変更可</span>
            </label>
            <input type="text" className="w-full border rounded px-3 py-2"
              value={form.staff} onChange={e => setForm({...form, staff: e.target.value})}
              placeholder="廣岡" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">工事種別</label>
            <select className="w-full border rounded px-3 py-2"
              value={form.work_type} onChange={e => setForm({...form, work_type: e.target.value})}>
              {work_types.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <button onClick={handleSubmit} disabled={submitting || (isCopy && !copyDataReady)}
            className={`w-full text-white py-3 rounded-lg font-medium disabled:opacity-40 ${isCopy ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {submitting ? '保存中...' : (isCopy ? '明細コピー編集へ →' : '新規作成 →')}
          </button>
          {isCopy && (
            <button onClick={handleBackToHistory}
              className="w-full border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">
              ← 過去見積一覧に戻る
            </button>
          )}
        </div>

        {!isCopy && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-700 mb-4">保存済み一覧</h2>
            {drafts.length === 0 ? (
              <p className="text-gray-400 text-sm">保存済みデータはありません</p>
            ) : (
              <div className="space-y-2">
                {drafts.map(d => (
                  <div key={d.id} onClick={() => handleLoad(d)}
                    className="border rounded p-3 cursor-pointer hover:bg-blue-50 flex justify-between items-start">
                    <div>
                      <div className="font-medium text-sm">{d.building} {d.title}</div>
                      <div className="text-xs text-gray-500">{d.date} / {d.staff} / {d.work_type}</div>
                      <div className="text-xs text-gray-400">
                        更新: {new Date(d.updated_at).toLocaleDateString('ja-JP')}
                      </div>
                    </div>
                    <button onClick={e => handleDelete(d.id, e)}
                      className="text-red-400 hover:text-red-600 text-sm ml-2">削除</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

export default function Page() {
  return <Suspense><HomePage /></Suspense>
}
