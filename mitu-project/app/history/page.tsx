// ============================================================
// ディレクトリ: mitu-project/app/history/
// ファイル名: page.tsx
// バージョン: V4.1.0
// 更新: 2026/04/25
// 変更: estimate画面をhistory内に埋め込み・URL遷移廃止
// ============================================================
'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const VERSION = 'V4.1.0'
const DEFAULT_UNITS = ['m2','m','ヶ所','式','台','本','枚','校','人工']
const PRESET_SECTIONS = ['解体工事','内装工事','特殊仮設工事','外部仕上工事','塗装工事','植栽工事','躯体工事']

const normalizeWorkType = (wt: string) =>
  wt.replace('Ａ', 'A').replace('Ｂ', 'B').replace('Ｃ', 'C')

// ==================== 型定義 ====================
type Estimate = {
  id: number
  date: string
  building: string
  title: string
  staff: string
  work_type: string
}

type EstimateItem = {
  id: number
  estimate_id: number
  work_section: string
  row_order: number
  name1: string
  name2: string | null
  name3: string | null
  spec1: string | null
  spec2: string | null
  spec3: string | null
  quantity: number
  unit: string
  unit_price: number
  amount: number
  note1: string | null
  note2: string | null
  note3: string | null
}

type PopupItem = {
  id: number
  name1: string; name2: string | null; name3: string | null
  spec1: string | null; spec2: string | null; spec3: string | null
  unit: string | null; unit_price: number | null
  note1: string | null; note2: string | null; note3: string | null
  estimate_id: number
}

type Row = {
  id: string; name1: string; name2: string; name3: string
  spec1: string; spec2: string; spec3: string
  quantity: string; unit: string; unit_price: string; amount: number
  note1: string; note2: string; note3: string
  showCandidates: boolean
  source_estimate_item_id: number | null
}

type Section = { id: string; name: string; rows: Row[] }

type Filters = {
  staff: string
  building: string
  workType: string
  year: string
}

type CopyInfo = {
  building: string
  staff: string
  work_type: string
  draft_id: number
}

const t = (str: string | null | undefined, len: number) => (str || '').slice(0, len)

// ==================== メインコンポーネント ====================
export default function HistoryPage() {

  // --- history用state ---
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null)
  const [items, setItems] = useState<EstimateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [copying, setCopying] = useState(false)
  const [showTitleList, setShowTitleList] = useState(false)
  const [is880, setIs880] = useState(false)
  const [filters, setFilters] = useState<Filters>({
    staff: '', building: '', workType: '', year: ''
  })

  // --- 画面切り替え用state ---
  const [showEstimate, setShowEstimate] = useState(false)
  const [copyInfo, setCopyInfo] = useState<CopyInfo | null>(null)

  // --- estimate用state ---
  const [sections, setSections] = useState<Section[]>([])
  const [customSection, setCustomSection] = useState('')
  const [showSectionInput, setShowSectionInput] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [units, setUnits] = useState<string[]>(DEFAULT_UNITS)
  const [popup, setPopup] = useState<{
    sectionId: string; rowId: string; workSection: string
  } | null>(null)
  const [popupItems, setPopupItems] = useState<PopupItem[]>([])
  const [popupLoading, setPopupLoading] = useState(false)
  const [popupSearch, setPopupSearch] = useState('')

  useEffect(() => {
    loadEstimates()
    loadUnits()
  }, [])

  // ==================== history関数 ====================
  const loadEstimates = async () => {
    const { data } = await supabase
      .from('estimates')
      .select('id,date,building,title,staff,work_type')
      .order('date', { ascending: false })
    const list = data || []
    setEstimates(list)
    if (list.length > 0) loadItems(list[0])
  }

  const loadItems = async (estimate: Estimate) => {
    setLoading(true)
    setSelectedEstimate(estimate)
    const { data } = await supabase
      .from('estimate_items')
      .select('*')
      .eq('estimate_id', estimate.id)
      .order('work_section', { ascending: true })
      .order('row_order', { ascending: true })
    setItems(data || [])
    setLoading(false)
  }

  const handleTitleSelect = (estimate: Estimate) => {
    loadItems(estimate)
    setShowTitleList(false)
  }

  const resetFilters = () => {
    setFilters({ staff: '', building: '', workType: '', year: '' })
    setShowTitleList(false)
  }

  const handleFilterChange = (newFilters: Filters) => {
    setFilters(newFilters)
    const filtered = estimates.filter(e => {
      if (newFilters.staff && e.staff !== newFilters.staff) return false
      if (newFilters.building && e.building !== newFilters.building) return false
      if (newFilters.workType && e.work_type !== newFilters.workType) return false
      if (newFilters.year && !e.date.startsWith(newFilters.year)) return false
      return true
    })
    if (filtered.length > 0) loadItems(filtered[0])
  }

  // ▼ V4.1.0: 遷移廃止・state切り替えに変更
  const handleCopyToEdit = async () => {
    if (!selectedEstimate) return
    setCopying(true)

    const { data: freshItems } = await supabase
      .from('estimate_items')
      .select('*')
      .eq('estimate_id', selectedEstimate.id)
      .order('work_section', { ascending: true })
      .order('row_order', { ascending: true })

    if (!freshItems || freshItems.length === 0) {
      alert('明細データがありません')
      setCopying(false)
      return
    }

    const normalItems = freshItems.filter((i: EstimateItem) => !i.work_section.startsWith('経費_'))
    const sectionNames = [...new Set(normalItems.map((i: EstimateItem) => i.work_section))]

    const newSections = (sectionNames as string[]).map((name: string) => ({
      id: Math.random().toString(36).slice(2),
      name,
      rows: normalItems
        .filter((i: EstimateItem) => i.work_section === name)
        .map((item: EstimateItem) => ({
          id: Math.random().toString(36).slice(2),
          name1: item.name1 || '',
          name2: item.name2 || '',
          name3: item.name3 || '',
          spec1: item.spec1 || '',
          spec2: item.spec2 || '',
          spec3: item.spec3 || '',
          quantity: '',
          unit: item.unit || '',
          unit_price: String(item.unit_price ?? ''),
          amount: 0,
          note1: item.note1 || '',
          note2: item.note2 || '',
          note3: item.note3 || '',
          showCandidates: false,
          source_estimate_item_id: item.id,
        }))
    }))

    const file_key = `copy_${selectedEstimate.id}_${Date.now()}`
    const { data, error } = await supabase.from('drafts').insert({
      file_key,
      date: '',
      building: selectedEstimate.building,
      title: '',
      staff: selectedEstimate.staff,
      work_type: normalizeWorkType(selectedEstimate.work_type),
      sections: newSections,
      updated_at: new Date().toISOString()
    }).select('id').single()

    if (error || !data) {
      alert('コピー保存に失敗しました')
      setCopying(false)
      return
    }

    // stateにセットして画面切り替え
    setSections(newSections)
    setCopyInfo({
      building: selectedEstimate.building,
      staff: selectedEstimate.staff,
      work_type: normalizeWorkType(selectedEstimate.work_type),
      draft_id: data.id,
    })
    setCopying(false)
    setShowEstimate(true)
  }

  // ==================== estimate関数 ====================
  const loadUnits = async () => {
    const { data } = await supabase.from('settings').select('value').eq('key','units').single()
    if (data) setUnits(data.value as string[])
  }

  const saveDraft = async () => {
    if (!copyInfo) return
    if (!copyInfo.building) {
      setSavedMsg('⚠️ 情報が不足しています')
      setTimeout(() => setSavedMsg(''), 3000)
      return
    }
    setSaving(true)
    const sectionsToSave = sections.map(s => ({
      ...s, rows: s.rows.map(r => ({ ...r, showCandidates: false }))
    }))
    await supabase.from('drafts').upsert({
      id: copyInfo.draft_id,
      file_key: `copy_${copyInfo.draft_id}`,
      date: '',
      building: copyInfo.building,
      title: '',
      staff: copyInfo.staff,
      work_type: copyInfo.work_type,
      sections: sectionsToSave,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' })
    setSaving(false)
    setSavedMsg('保存しました！')
    setTimeout(() => setSavedMsg(''), 3000)
  }

  const openPopup = async (sectionId: string, rowId: string, sectionName: string) => {
    setPopup({ sectionId, rowId, workSection: sectionName })
    setPopupSearch('')
    setPopupLoading(true)
    const { data } = await supabase
      .from('estimate_items')
      .select('id,name1,name2,name3,spec1,spec2,spec3,unit,unit_price,note1,note2,note3,estimate_id')
      .eq('work_section', sectionName)
      .not('name1', 'is', null)
      .order('name1')
    setPopupItems(data || [])
    setPopupLoading(false)
  }

  const handleNameInput = (sectionId: string, rowId: string, sectionName: string, value: string) => {
    updateRow(sectionId, rowId, 'name1', value)
    if (value.length >= 2) openPopup(sectionId, rowId, sectionName)
  }

  const selectPopupItem = (item: PopupItem) => {
    if (!popup) return
    setSections(prev => prev.map(s => {
      if (s.id !== popup.sectionId) return s
      return {
        ...s, rows: s.rows.map(r => {
          if (r.id !== popup.rowId) return r
          const unit_price = item.unit_price?.toString() || ''
          return {
            ...r,
            name1: item.name1 || '', name2: item.name2 || '', name3: item.name3 || '',
            spec1: item.spec1 || '', spec2: item.spec2 || '', spec3: item.spec3 || '',
            unit: item.unit || '', unit_price,
            amount: 0,
            note1: item.note1 || '', note2: item.note2 || '', note3: item.note3 || '',
            source_estimate_item_id: item.id,
            showCandidates: false
          }
        })
      }
    }))
    setPopup(null)
  }

  const filteredPopupItems = popupItems.filter(item => {
    if (!popupSearch) return true
    const kw = popupSearch.toLowerCase()
    return (item.name1 || '').toLowerCase().includes(kw) || (item.spec1 || '').toLowerCase().includes(kw)
  })

  const uniquePopupItems = filteredPopupItems.filter((item, idx, arr) =>
    arr.findIndex(x => x.name1 === item.name1 && x.spec1 === item.spec1) === idx
  )

  const newRow = (): Row => ({
    id: Math.random().toString(36).slice(2),
    name1:'', name2:'', name3:'',
    spec1:'', spec2:'', spec3:'',
    quantity:'', unit:'', unit_price:'', amount:0,
    note1:'', note2:'', note3:'',
    showCandidates:false,
    source_estimate_item_id: null
  })

  const addSection = (name: string) => {
    if (!name.trim()) return
    setSections(prev => [...prev, { id: Math.random().toString(36).slice(2), name, rows: [] }])
    setCustomSection('')
    setShowSectionInput(false)
  }

  const deleteSection = (id: string) => setSections(prev => prev.filter(s => s.id !== id))

  const addRow = (sectionId: string, sectionName: string) => {
    const row = newRow()
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, rows: [...s.rows, row] } : s
    ))
    openPopup(sectionId, row.id, sectionName)
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

  const subtotal = (s: Section) => s.rows.reduce((sum, r) => sum + r.amount, 0)
  const grandTotal = sections.reduce((sum, s) => sum + subtotal(s), 0)

  const handleExport = async () => {
    if (!copyInfo) return
    await saveDraft()
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '',
        building: copyInfo.building,
        title: '',
        staff: copyInfo.staff,
        work_type: copyInfo.work_type,
        sections
      })
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `copy_${copyInfo.building}_${copyInfo.staff}.xlsx`
    a.click()
  }

  // ==================== history用計算 ====================
  const filteredEstimates = estimates.filter(e => {
    if (filters.staff && e.staff !== filters.staff) return false
    if (filters.building && e.building !== filters.building) return false
    if (filters.workType && e.work_type !== filters.workType) return false
    if (filters.year && !e.date.startsWith(filters.year)) return false
    return true
  })

  const staffList = [...new Set(estimates.map(e => e.staff))]
  const buildings = [...new Set(estimates.map(e => e.building))]
  const workTypes = [...new Set(estimates.map(e => e.work_type))]
  const years = [...new Set(estimates.map(e => e.date.slice(0, 4)))].sort().reverse()

  const SECTION_ORDER = ['解体工事','内装工事','特殊仮設工事','外部仕上工事','塗装工事','植栽工事','躯体工事']
  const normalItems = items.filter(i => !i.work_section.startsWith('経費_'))
  const sectionNames = [...new Set(normalItems.map(i => i.work_section))]
    .sort((a, b) => {
      const ai = SECTION_ORDER.indexOf(a)
      const bi = SECTION_ORDER.indexOf(b)
      if (ai === -1 && bi === -1) return a.localeCompare(b)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })

  const fmt = (n: number) => Math.round(n).toLocaleString()

  const getSectionData = (sectionName: string) => {
    const sectionItems = normalItems.filter(i => i.work_section === sectionName)
    const expenses = items.filter(i => i.work_section === `経費_${sectionName}`)
    const subtotal = sectionItems.reduce((sum, i) => sum + (i.amount || 0), 0)
    const expTotal = expenses.reduce((sum, i) => sum + (i.amount || 0), 0)
    const total = Math.floor((subtotal + expTotal) / 100) * 100
    return { sectionItems, expenses, subtotal, total }
  }

  const historyGrandTotal = sectionNames.reduce((sum, name) => sum + getSectionData(name).total, 0)

  const handleExportHistory = async () => {
    if (!selectedEstimate) return
    const exportSections = sectionNames.map(name => {
      const { sectionItems } = getSectionData(name)
      return {
        id: name, name,
        rows: sectionItems.map(item => ({
          id: String(item.id),
          name1: item.name1 || '', name2: item.name2 || '', name3: item.name3 || '',
          spec1: item.spec1 || '', spec2: item.spec2 || '', spec3: item.spec3 || '',
          quantity: String(item.quantity), unit: item.unit || '',
          unit_price: String(item.unit_price), amount: item.amount,
          note1: item.note1 || '', note2: item.note2 || '', note3: item.note3 || '',
          candidates: [], showCandidates: false,
        }))
      }
    })
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: selectedEstimate.date,
        building: selectedEstimate.building,
        title: selectedEstimate.title,
        staff: selectedEstimate.staff,
        work_type: selectedEstimate.work_type,
        sections: exportSections
      })
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedEstimate.date.replace(/-/g,'')}_${selectedEstimate.building}_${selectedEstimate.title}_${selectedEstimate.staff}_${selectedEstimate.work_type}.xlsx`
    a.click()
  }

  const colWidths = {
    no: '3%', name: '26%', spec: '24%', qty: '6%',
    unit: '4%', price: '10%', amount: '11%', note: '16%',
  }

  // ==================== estimate画面 ====================
  if (showEstimate && copyInfo) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => { setShowEstimate(false); setSections([]) }}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium text-sm">
              ← 戻る
            </button>
            <h1 className="text-xl font-bold text-gray-800">明細入力（コピー編集）</h1>
            <span className="bg-orange-500 text-xs text-white px-2 py-0.5 rounded">コピー編集中</span>
            <span className="ml-auto text-xs text-gray-400">{VERSION}</span>
          </div>

          <div className="bg-white rounded p-3 mb-4 text-sm text-gray-600 flex gap-4 flex-wrap">
            <span>📅 日付を入力してください</span>
            <span>{copyInfo.building}</span>
            <span className="font-medium">📝 件名を入力してください</span>
            <span>{copyInfo.staff}</span>
            <span>{copyInfo.work_type}</span>
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
                      <th className="p-2 text-left w-8"></th>
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
                        <td className="p-1 pt-2">
                          <button
                            onClick={() => openPopup(section.id, row.id, section.name)}
                            className="w-7 h-7 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm"
                            title="品目選択">📋</button>
                        </td>
                        <td className="p-1">
                          <input className="w-full border rounded px-2 py-1 mb-1" value={row.name1} placeholder="名称1段目"
                            onChange={e => handleNameInput(section.id, row.id, section.name, e.target.value)} />
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
                          {row.source_estimate_item_id && (
                            <div className="text-gray-300 text-xs text-right mt-1">#{row.source_estimate_item_id}</div>
                          )}
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
                  <button onClick={() => addRow(section.id, section.name)} className="text-blue-600 hover:text-blue-800 text-sm">+ 行追加</button>
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
              {savedMsg && <span className="text-sm" style={{color: savedMsg.includes('⚠️') ? 'red' : 'green'}}>{savedMsg}</span>}
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

        {popup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-800 rounded-t-lg">
                <h3 className="text-white font-bold">品目選択 - {popup.workSection}</h3>
                <button onClick={() => setPopup(null)} className="text-white hover:text-blue-200 text-xl">×</button>
              </div>
              <div className="p-3 border-b">
                <input className="w-full border rounded px-3 py-2 text-sm" placeholder="名称・仕様で絞り込み"
                  value={popupSearch} onChange={e => setPopupSearch(e.target.value)} autoFocus />
              </div>
              <div className="overflow-y-auto flex-1">
                {popupLoading ? (
                  <div className="p-8 text-center text-gray-400">読み込み中...</div>
                ) : uniquePopupItems.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    {popupSearch ? '該当する品目がありません' : 'このカテゴリの品目データがありません'}
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="p-2 text-left">名称</th>
                        <th className="p-2 text-left">仕様</th>
                        <th className="p-2 text-left w-12">単位</th>
                        <th className="p-2 text-right w-20">単価</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uniquePopupItems.map(item => (
                        <tr key={item.id} className="border-t hover:bg-blue-50 cursor-pointer"
                          onClick={() => selectPopupItem(item)}>
                          <td className="p-2">
                            <div>{item.name1}</div>
                            {item.name2 && <div className="text-gray-400">{item.name2}</div>}
                          </td>
                          <td className="p-2 text-gray-500"><div>{item.spec1}</div></td>
                          <td className="p-2">{item.unit}</td>
                          <td className="p-2 text-right font-medium">
                            {item.unit_price ? item.unit_price.toLocaleString() : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="px-4 py-2 border-t text-xs text-gray-400 text-right">
                {uniquePopupItems.length}件表示
              </div>
            </div>
          </div>
        )}
      </main>
    )
  }

  // ==================== history画面 ====================
  return (
    <div style={is880 ? { maxWidth: '880px', margin: '0 auto' } : {}}>
      <main className="min-h-screen bg-gray-50">
        <div className="sticky top-0 z-20 bg-white border-b shadow-sm px-2 py-1 flex items-center gap-1">
          <span className="text-xs text-gray-400 font-mono mr-1">{VERSION}</span>
          <div className="relative">
            <button onClick={() => setShowTitleList(!showTitleList)}
              className="border border-blue-300 rounded px-2 py-0.5 text-xs bg-blue-50 hover:bg-blue-100 font-medium whitespace-nowrap">
              件名▼
            </button>
            {showTitleList && (
              <div className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg z-30 min-w-[300px] max-h-[60vh] overflow-y-auto">
                {filteredEstimates.map((e, i) => (
                  <div key={e.id}>
                    <div onClick={() => handleTitleSelect(e)}
                      className={`px-4 py-2 cursor-pointer hover:bg-blue-50 text-sm ${selectedEstimate?.id === e.id ? 'bg-blue-100 font-medium' : ''}`}>
                      <div className="font-medium">{e.title}</div>
                      <div className="text-xs text-gray-500">{e.date} / {e.building} / {e.staff}</div>
                    </div>
                    {i < filteredEstimates.length - 1 && <div className="h-2 bg-gray-50" />}
                  </div>
                ))}
                {filteredEstimates.length === 0 && (
                  <div className="px-4 py-3 text-sm text-gray-400">該当なし</div>
                )}
              </div>
            )}
          </div>
          <select className="border rounded px-1 py-0.5 text-xs w-20" value={filters.staff}
            onChange={e => handleFilterChange({ ...filters, staff: e.target.value })}>
            <option value="">担当者▼</option>
            {staffList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="border rounded px-1 py-0.5 text-xs w-24" value={filters.building}
            onChange={e => handleFilterChange({ ...filters, building: e.target.value })}>
            <option value="">ビル名▼</option>
            {buildings.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="border rounded px-1 py-0.5 text-xs w-20" value={filters.workType}
            onChange={e => handleFilterChange({ ...filters, workType: e.target.value })}>
            <option value="">種別▼</option>
            {workTypes.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <select className="border rounded px-1 py-0.5 text-xs w-16" value={filters.year}
            onChange={e => handleFilterChange({ ...filters, year: e.target.value })}>
            <option value="">年▼</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={handleExportHistory}
            className="bg-green-600 text-white px-2 py-0.5 rounded text-xs hover:bg-green-700 whitespace-nowrap">
            Excel
          </button>
          <button onClick={handleCopyToEdit} disabled={copying || !selectedEstimate || loading}
            className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap">
            {copying || loading ? '読込中...' : 'コピー編集'}
          </button>
          <button onClick={() => setIs880(!is880)}
            style={{
              backgroundColor: is880 ? '#2563eb' : '#ffffff',
              color: is880 ? '#ffffff' : '#2563eb',
              border: '1px solid #2563eb',
              borderRadius: '4px', padding: '2px 8px',
              fontSize: '12px', fontWeight: 'bold',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            880
          </button>
          <button onClick={resetFilters}
            className="ml-auto bg-orange-500 text-white px-3 py-0.5 rounded font-bold text-xs hover:bg-orange-600 whitespace-nowrap">
            ←
          </button>
        </div>

        {selectedEstimate && (
          <div className="bg-blue-50 border-b px-4 py-1 text-xs text-gray-700 flex gap-4 flex-wrap">
            <span>{selectedEstimate.date}</span>
            <span>{selectedEstimate.building}</span>
            <span className="font-medium">{selectedEstimate.title}</span>
            <span>{selectedEstimate.staff}</span>
            <span>{selectedEstimate.work_type}</span>
          </div>
        )}

        <div className="p-4">
          {loading ? (
            <div className="text-center py-8 text-gray-400">読み込み中...</div>
          ) : (
            <>
              {sectionNames.map(sectionName => {
                const { sectionItems, expenses, subtotal, total } = getSectionData(sectionName)
                return (
                  <div key={sectionName} className="mb-6">
                    <div className="bg-blue-800 text-white px-4 py-2 flex justify-between items-center">
                      <span className="font-bold text-sm">{sectionName}</span>
                      <span className="text-xs">小計 {fmt(subtotal)} 円</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full bg-white border border-t-0" style={{tableLayout:'fixed', fontSize:'11px'}}>
                        <colgroup>
                          <col style={{width: colWidths.no}} />
                          <col style={{width: colWidths.name}} />
                          <col style={{width: colWidths.spec}} />
                          <col style={{width: colWidths.qty}} />
                          <col style={{width: colWidths.unit}} />
                          <col style={{width: colWidths.price}} />
                          <col style={{width: colWidths.amount}} />
                          <col style={{width: colWidths.note}} />
                        </colgroup>
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="p-1 text-center">No.</th>
                            <th className="p-1 text-left">名称</th>
                            <th className="p-1 text-left">仕様</th>
                            <th className="p-1 text-right">数量</th>
                            <th className="p-1 text-center">単位</th>
                            <th className="p-1 text-right">単価</th>
                            <th className="p-1 text-right">金額</th>
                            <th className="p-1 text-left">備考</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectionItems.map(item => (
                            <tr key={item.id} className="border-t align-top">
                              <td className="p-1 text-center">{String(item.row_order).slice(0,2)}</td>
                              <td className="p-1 overflow-hidden">
                                {item.name1 && <div className="truncate" style={{fontSize:'11px'}}>{t(item.name1,12)}</div>}
                                {item.name2 && <div className="truncate text-gray-500" style={{fontSize:'11px'}}>{t(item.name2,12)}</div>}
                                {item.name3 && <div className="truncate text-gray-500" style={{fontSize:'11px'}}>{t(item.name3,12)}</div>}
                              </td>
                              <td className="p-1 overflow-hidden">
                                {item.spec1 && <div className="truncate" style={{fontSize:'10px'}}>{t(item.spec1,16)}</div>}
                                {item.spec2 && <div className="truncate text-gray-500" style={{fontSize:'10px'}}>{t(item.spec2,16)}</div>}
                                {item.spec3 && <div className="truncate text-gray-500" style={{fontSize:'10px'}}>{t(item.spec3,16)}</div>}
                              </td>
                              <td className="p-1 text-right">{item.quantity?.toFixed(1)}</td>
                              <td className="p-1 text-center">{t(item.unit,2)}</td>
                              <td className="p-1 text-right">{fmt(item.unit_price)}</td>
                              <td className="p-1 text-right">{fmt(item.amount)}</td>
                              <td className="p-1 overflow-hidden">
                                {item.note1 && <div className="truncate" style={{fontSize:'10px'}}>{t(item.note1,7)}</div>}
                                {item.note2 && <div className="truncate text-gray-500" style={{fontSize:'10px'}}>{t(item.note2,7)}</div>}
                                {item.note3 && <div className="truncate text-gray-500" style={{fontSize:'10px'}}>{t(item.note3,7)}</div>}
                              </td>
                            </tr>
                          ))}
                          {expenses.map(exp => (
                            <tr key={exp.id} className="border-t bg-gray-50 align-top">
                              <td className="p-1"></td>
                              <td className="p-1 text-gray-600 truncate" style={{fontSize:'11px'}}>{t(exp.name1,12)}</td>
                              <td className="p-1 text-gray-600 truncate" style={{fontSize:'10px'}}>{t(exp.spec1,16)}</td>
                              <td className="p-1 text-right text-gray-600">{exp.quantity?.toFixed(1)}</td>
                              <td className="p-1 text-center text-gray-600">{t(exp.unit,2)}</td>
                              <td className="p-1 text-right text-gray-600">{fmt(exp.unit_price)}</td>
                              <td className="p-1 text-right text-gray-600">{fmt(exp.amount)}</td>
                              <td className="p-1 text-gray-600 truncate" style={{fontSize:'10px'}}>{t(exp.note1,7)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="bg-gray-200 border border-t-0 px-4 py-1.5 flex justify-between font-bold text-sm">
                      <span>{sectionName}　合計</span>
                      <span>{fmt(total)} 円</span>
                    </div>
                  </div>
                )
              })}
              {sectionNames.length > 0 && (
                <div className="bg-blue-900 text-white px-6 py-4 rounded flex justify-between items-center mt-4 mb-8">
                  <span className="text-lg font-bold">建築工事の計</span>
                  <span className="text-xl font-bold">{fmt(historyGrandTotal)} 円</span>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
