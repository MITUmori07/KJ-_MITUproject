'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const DEFAULT_UNITS = ['m2','m','ヶ所','式','台','本','枚','校','人工']
const PRESET_SECTIONS = ['解体工事','内装工事','特殊仮設工事','外部仕上工事','塗装工事','植栽工事','躯体工事']

type Item = { id: number; name1: string; name2: string; name3: string; spec1: string; unit: string }
type Row = {
  id: string; name1: string; name2: string; name3: string
  spec1: string; spec2: string; spec3: string
  quantity: string; unit: string; unit_price: string; amount: number
  note1: string; note2: string; note3: string
  candidates: Item[]; showCandidates: boolean
}
type Section = { id: string; name: string; rows: Row[] }

function EstimatePage() {
  const params = useSearchParams()
  const router = useRouter()
  const date = params.get('date') || ''
  const building = params.get('building') || ''
  const title = params.get('title') || ''
  const staff = params.get('staff') || ''
  const work_type = params.get('work_type') || ''
  const draft_id = params.get('draft_id') || ''

  const [sections, setSections] = useState<Section[]>([])
  const [customSection, setCustomSection] = useState('')
  const [showSectionInput, setShowSectionInput] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [units, setUnits] = useState<string[]>(DEFAULT_UNITS)

  useEffect(() => {
    loadUnits()
    if (draft_id) loadDraft(draft_id)
  }, [])

  const loadUnits = async () => {
    const { data } = await supabase.from('settings').select('value').eq('key','units').single()
    if (data) setUnits(data.value as string[])
  }

  const loadDraft = async (id: string) => {
    const { data } = await supabase.from('drafts').select('sections').eq('id', id).single()
    if (data?.sections) setSections(data.sections as Section[])
  }

  const saveDraft = async () => {
    setSaving(true)
    const file_key = `${date}_${building}_${title}_${staff}_${work_type}`
    const sectionsToSave = sections.map(s => ({
      ...s, rows: s.rows.map(r => ({ ...r, candidates: [], showCandidates: false }))
    }))
    await supabase.from('drafts').upsert({
      file_key, date, building, title, staff, work_type,
      sections: sectionsToSave,
      updated_at: new Date().toISOString()
    }, { onConflict: 'file_key' })
    setSaving(false)
    setSavedMsg('保存しました！')
    setTimeout(() => setSavedMsg(''), 3000)
  }

  const newRow = (): Row => ({
    id: Math.random().toString(36).slice(2),
    name1:'', name2:'', name3:'',
    spec1:'', spec2:'', spec3:'',
    quantity:'', unit:'', unit_price:'', amount:0,
    note1:'', note2:'', note3:'',
    candidates:[], showCandidates:false
  })

  const addSection = (name: string) => {
    if (!name.trim()) return
    setSections(prev => [...prev, { id: Math.random().toString(36).slice(2), name, rows: [] }])
    setCustomSection('')
    setShowSectionInput(false)
  }

  const deleteSection = (id: string) => setSections(prev => prev.filter(s => s.id !== id))

  const addRow = (sectionId: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, rows: [...s.rows, newRow()] } : s
    ))
  }

  const deleteRow = (sectionId: string, rowId: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, rows: s.rows.filter(r => r.id !== rowId) } : s
    ))
  }

  const updateRow = (sectionId: string, rowId: string, field: string, value: string) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      return {
        ...s, rows: s.rows.map(r => {
          if (r.id !== rowId) return r
          const updated = { ...r, [field]: value }
          const q = parseFloat(updated.quantity) || 0
          const p = parseFloat(updated.unit_price) || 0
          updated.amount = Math.round(q * p * 10) / 10
          return updated
        })
      }
    }))
  }

  const searchItems = async (sectionId: string, rowId: string, keyword: string) => {
    if (keyword.length < 2) return
    const { data } = await supabase.from('items').select('id,name1,name2,name3,spec1,unit')
      .or(`name1.ilike.%${keyword}%,name2.ilike.%${keyword}%`).limit(5)
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      return { ...s, rows: s.rows.map(r =>
        r.id === rowId ? { ...r, candidates: data || [], showCandidates: true } : r
      )}
    }))
  }

  const selectCandidate = (sectionId: string, rowId: string, item: Item) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      return { ...s, rows: s.rows.map(r =>
        r.id === rowId ? {
          ...r,
          name1: item.name1||'', name2: item.name2||'', name3: item.name3||'',
          spec1: item.spec1||'', unit: item.unit||'',
          candidates: [], showCandidates: false
        } : r
      )}
    }))
  }

  const subtotal = (s: Section) => s.rows.reduce((sum, r) => sum + r.amount, 0)
  const grandTotal = sections.reduce((sum, s) => sum + subtotal(s), 0)

  const handleExport = async () => {
    await saveDraft()
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, building, title, staff, work_type, sections })
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${date.replace(/-/g,'')}_${building}_${title}_${staff}_${work_type}.xlsx`
    a.click()
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-4">
          <button onClick={() => router.push('/')} className="text-gray-500 hover:text-gray-700">← 戻る</button>
          <h1 className="text-xl font-bold text-gray-800">明細入力</h1>
        </div>
        <div className="bg-white rounded p-3 mb-4 text-sm text-gray-600 flex gap-4 flex-wrap">
          <span>{date}</span><span>{building}</span>
          <span className="font-medium">{title}</span>
          <span>{staff}</span><span>{work_type}</span>
        </div>

        {sections.map(section => (
          <div key={section.id} className="mb-6">
            <div className="flex items-center justify-between bg-blue-800 text-white px-4 py-2 rounded-t">
              <h2 className="text-lg font-bold">{section.name}</h2>
              <button onClick={() => deleteSection(section.id)} className="text-blue-200 hover:text-white text-sm">× 削除</button>
            </div>
            <div className="bg-white border border-t-0 rounded-b overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left w-44">名称</th>
                    <th className="p-2 text-left w-36">仕様</th>
                    <th className="p-2 text-right w-16">数量</th>
                    <th className="p-2 text-left w-16">単位</th>
                    <th className="p-2 text-right w-20">単価</th>
                    <th className="p-2 text-right w-22">金額</th>
                    <th className="p-2 text-left w-28">備考</th>
                    <th className="p-2 w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map(row => (
                    <tr key={row.id} className="border-t align-top">
                      <td className="p-1 relative">
                        <input className="w-full border rounded px-2 py-1 mb-1" value={row.name1} placeholder="名称1段目"
                          onChange={e => { updateRow(section.id, row.id, 'name1', e.target.value); searchItems(section.id, row.id, e.target.value) }} />
                        {row.showCandidates && row.candidates.length > 0 && (
                          <div className="absolute z-10 bg-white border shadow-lg rounded mt-1 w-64 left-0">
                            {row.candidates.map(c => (
                              <div key={c.id} className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b"
                                onClick={() => selectCandidate(section.id, row.id, c)}>
                                <div className="font-medium">{c.name1}</div>
                                {c.name2 && <div className="text-gray-500">{c.name2}</div>}
                                {c.spec1 && <div className="text-blue-400">{c.spec1}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                        <input className="w-full border rounded px-2 py-1 mb-1" value={row.name2} placeholder="名称2段目"
                          onChange={e => updateRow(section.id, row.id, 'name2', e.target.value)} />
                        <input className="w-full border rounded px-2 py-1" value={row.name3} placeholder="名称3段目"
                          onChange={e => updateRow(section.id, row.id, 'name3', e.target.value)} />
                      </td>
                      <td className="p-1">
                        <input className="w-full border rounded px-2 py-1 mb-1" value={row.spec1} placeholder="仕様1段目"
                          onChange={e => updateRow(section.id, row.id, 'spec1', e.target.value)} />
                        <input className="w-full border rounded px-2 py-1 mb-1" value={row.spec2} placeholder="仕様2段目"
                          onChange={e => updateRow(section.id, row.id, 'spec2', e.target.value)} />
                        <input className="w-full border rounded px-2 py-1" value={row.spec3} placeholder="仕様3段目"
                          onChange={e => updateRow(section.id, row.id, 'spec3', e.target.value)} />
                      </td>
                      <td className="p-1">
                        <input className="w-full border rounded px-2 py-1 text-right" value={row.quantity} type="number" step="0.1"
                          onChange={e => updateRow(section.id, row.id, 'quantity', e.target.value)} />
                      </td>
                      <td className="p-1">
                        <select className="w-full border rounded px-1 py-1 mb-1" value={row.unit}
                          onChange={e => updateRow(section.id, row.id, 'unit', e.target.value)}>
                          <option value="">選択</option>
                          {units.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <input className="w-full border rounded px-2 py-1 text-xs" value={row.unit} placeholder="自由入力"
                          onChange={e => updateRow(section.id, row.id, 'unit', e.target.value)} />
                      </td>
                      <td className="p-1">
                        <input className="w-full border rounded px-2 py-1 text-right" value={row.unit_price} type="number"
                          onChange={e => updateRow(section.id, row.id, 'unit_price', e.target.value)} />
                      </td>
                      <td className="p-1 text-right pr-2 pt-2">{row.amount.toLocaleString()}</td>
                      <td className="p-1">
                        <input className="w-full border rounded px-2 py-1 mb-1" value={row.note1} placeholder="備考1段目"
                          onChange={e => updateRow(section.id, row.id, 'note1', e.target.value)} />
                        <input className="w-full border rounded px-2 py-1 mb-1" value={row.note2} placeholder="備考2段目"
                          onChange={e => updateRow(section.id, row.id, 'note2', e.target.value)} />
                        <input className="w-full border rounded px-2 py-1" value={row.note3} placeholder="備考3段目"
                          onChange={e => updateRow(section.id, row.id, 'note3', e.target.value)} />
                      </td>
                      <td className="p-1 pt-2">
                        <button onClick={() => deleteRow(section.id, row.id)} className="text-red-400 hover:text-red-600 text-lg">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-2 flex justify-between items-center border-t">
                <button onClick={() => addRow(section.id)} className="text-blue-600 hover:text-blue-800 text-sm">+ 行追加</button>
                <div className="text-sm font-medium">小計: {subtotal(section).toLocaleString()} 円</div>
              </div>
            </div>
          </div>
        ))}

        <div className="mb-6">
          {!showSectionInput ? (
            <button onClick={() => setShowSectionInput(true)}
              className="w-full border-2 border-dashed border-blue-300 text-blue-600 py-3 rounded-lg hover:bg-blue-50">
              + 工事区分を追加
            </button>
          ) : (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">工事区分を選択または入力</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {PRESET_SECTIONS.filter(p => !sections.find(s => s.name === p)).map(p => (
                  <button key={p} onClick={() => addSection(p)}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm">{p}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="flex-1 border rounded px-3 py-2 text-sm" value={customSection} placeholder="その他（自由入力）"
                  onChange={e => setCustomSection(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSection(customSection)} />
                <button onClick={() => addSection(customSection)} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">追加</button>
                <button onClick={() => setShowSectionInput(false)} className="text-gray-500 px-3 py-2 text-sm">キャンセル</button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded p-4 flex justify-between items-center sticky bottom-4 shadow-lg">
          <div className="text-xl font-bold">合計: {grandTotal.toLocaleString()} 円</div>
          <div className="flex gap-3 items-center">
            {savedMsg && <span className="text-green-600 text-sm">{savedMsg}</span>}
            <button onClick={saveDraft} disabled={saving}
              className="bg-yellow-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-yellow-600 disabled:opacity-50">
              {saving ? '保存中...' : '途中保存'}
            </button>
            <button onClick={handleExport}
              className="bg-green-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-green-700">
              Excelダウンロード
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function Page() {
  return <Suspense><EstimatePage /></Suspense>
}
