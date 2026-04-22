'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

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
  const [date, setDate] = useState('')
  const [building, setBuilding] = useState('')
  const [title, setTitle] = useState('')
  const [staff, setStaff] = useState('')
  const [work_type, setWorkType] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])

  useEffect(() => { loadDrafts() }, [])

  const loadDrafts = async () => {
    const { data } = await supabase.from('drafts').select('*').order('updated_at', { ascending: false })
    if (data) setDrafts(data)
  }

  const handleNew = () => {
    if (!date || !building || !title || !staff || !work_type) { alert('全項目を入力してください'); return }
    const params = new URLSearchParams({ date, building, title, staff, work_type })
    router.push(`/estimate?${params.toString()}`)
  }

  const handleLoad = (draft: Draft) => {
    const params = new URLSearchParams({ date: draft.date, building: draft.building, title: draft.title, staff: draft.staff, work_type: draft.work_type, draft_id: String(draft.id) })
    router.push(`/estimate?${params.toString()}`)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('削除しますか？')) return
    await supabase.from('drafts').delete().eq('id', id)
    loadDrafts()
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">見積作成システム</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold mb-4">新規作成</h2>
          <div className="space-y-3">
            <input type="date" className="w-full border rounded px-3 py-2" value={date} onChange={e => setDate(e.target.value)} />
            <select className="w-full border rounded px-3 py-2" value={building} onChange={e => setBuilding(e.target.value)}>
              <option value="">ビル名を選択</option>
              <option>新宿FT</option>
              <option>新宿ESS</option>
            </select>
            <input className="w-full border rounded px-3 py-2" placeholder="件名" value={title} onChange={e => setTitle(e.target.value)} />
            <input className="w-full border rounded px-3 py-2" placeholder="担当者" value={staff} onChange={e => setStaff(e.target.value)} />
            <select className="w-full border rounded px-3 py-2" value={work_type} onChange={e => setWorkType(e.target.value)}>
              <option value="">工事種別を選択</option>
              <option>A工事</option>
              <option>B工事</option>
              <option>C工事</option>
            </select>
            <button onClick={handleNew} className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700">新規作成</button>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold mb-4">保存済み一覧</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {drafts.length === 0 && <p className="text-gray-400 text-sm">保存済みデータなし</p>}
            {drafts.map(d => (
              <div key={d.id} className="border rounded p-3 flex justify-between items-center hover:bg-gray-50">
                <div onClick={() => handleLoad(d)} className="cursor-pointer flex-1">
                  <div className="font-medium text-sm">{d.title}</div>
                  <div className="text-xs text-gray-500">{d.date} / {d.building} / {d.staff} / {d.work_type}</div>
                </div>
                <button onClick={() => handleDelete(d.id)} className="text-red-400 hover:text-red-600 ml-2 text-sm">削除</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
