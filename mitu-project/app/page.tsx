'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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

export default function Home() {
  const router = useRouter()
  const [form, setForm] = useState({
    date: '', building: '', title: '', staff: '', work_type: 'C工事',
  })
  const [drafts, setDrafts] = useState<Draft[]>([])
  const buildings = ['新宿FT', '新宿ESS']
  const work_types = ['A工事', 'B工事', 'C工事']

  useEffect(() => {
    loadDrafts()
  }, [])

  const loadDrafts = async () => {
    const { data } = await supabase
      .from('drafts')
      .select('id,file_key,date,building,title,staff,work_type,updated_at')
      .order('updated_at', { ascending: false })
      .limit(20)
    setDrafts(data || [])
  }

  const handleNew = () => {
    if (!form.date || !form.building || !form.title || !form.staff) {
      alert('全項目入力してください')
      return
    }
    const params = new URLSearchParams(form)
    router.push(`/estimate?${params.toString()}`)
  }

  const handleLoad = (draft: Draft) => {
    const params = new URLSearchParams({
      date: draft.date,
      building: draft.building,
      title: draft.title,
      staff: draft.staff,
      work_type: draft.work_type,
      draft_id: String(draft.id)
    })
    router.push(`/estimate?${params.toString()}`)
  }

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('削除しますか？')) return
    await supabase.from('drafts').delete().eq('id', id)
    loadDrafts()
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold mb-8 text-gray-800">見積作成システム</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-700">新規作成</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日付</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">件名</label>
            <input type="text" className="w-full border rounded px-3 py-2"
              value={form.title} onChange={e => setForm({...form, title: e.target.value})}
              placeholder="17階1701区外原状回復工事" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">担当者</label>
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
          <button onClick={handleNew}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700">
            新規作成 →
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold text-gray-700 mb-4">保存済み一覧</h2>
          {drafts.length === 0 ? (
            <p className="text-gray-400 text-sm">保存済みデータはありません</p>
          ) : (
            <div className="space-y-2">
              {drafts.map(d => (
                <div key={d.id}
                  onClick={() => handleLoad(d)}
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
      </div>
    </main>
  )
}
