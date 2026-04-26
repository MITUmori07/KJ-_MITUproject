// ============================================================
// ディレクトリ: mitu-project/app/history/
// ファイル名: page.tsx
// バージョン: V5.0.5
// 更新: 2026/04/25
// 変更: ポップアップタブ表示修正・年度選択修正・
//       解体なし時件名表示バグ修正・工事区分削除アラート追加
// ============================================================
'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const VERSION = 'V5.0.5'
const DEFAULT_UNITS = ['m2','m','ヶ所','式','台','本','枚','校','人工']
const PRESET_SECTIONS = ['解体工事','内装工事','外部仕上工事','塗装工事','植栽工事','躯体工事','特殊仮設工事']
const FIRST_SECTION = '解体工事'
const LAST_SECTION = '特殊仮設工事'

const normalizeWorkType = (wt: string) =>
  wt.replace('Ａ', 'A').replace('Ｂ', 'B').replace('Ｃ', 'C')

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

type MasterItem = {
  id: number
  name1: string
  name2: string | null
  name3: string | null
  spec1: string | null
  spec2: string | null
  spec3: string | null
  unit: string | null
  item_prices: { fiscal_year: number; price1: number }[]
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
  date: string
  title: string
}

const t = (str: string | null | undefined, len: number) => (str || '').slice(0, len)

export default function HistoryPage() {

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

  const [showEstimate, setShowEstimate] = useState(false)
  const [copyInfo, setCopyInfo] = useState<CopyInfo | null>(null)
  const copyItemsRef = useRef<EstimateItem[]>([])

  const [sections, setSections] = useState<Section[]>([])
  const [customSection, setCustomSection] = useState('')
  const [showSectionInput, setShowSectionInput] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [units, setUnits] = useState<string[]>(DEFAULT_UNITS)

  // ▼ ポップアップstate
  const [popup, setPopup] = useState<{
    sectionId: string; rowId: string; workSection: string
  } | null>(null)
  const [popupTab, setPopupTab] = useState<'history' | 'master'>('history')
  const [popupItems, setPopupItems] = useState<PopupItem[]>([])
  const [masterItems, setMasterItems] = useState<MasterItem[]>([])
  const [popupLoading, setPopupLoading] = useState(false)
  const [popupSearch, setPopupSearch] = useState('')
  const [fiscalYear, setFiscalYear] = useState<number>(2026)
  const [availableYears, setAvailableYears] = useState<number[]>([2026, 2025])
  const [currentRowName, setCurrentRowName] = useState('')

  useEffect(() => {
    loadEstimates()
    loadUnits()
    loadAvailableYears()
  }, [])

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
    const rawSectionNames = [...new Set(normalItems.map((i: EstimateItem) => i.work_section))] as string[]
    const sortedSectionNames = sortSectionNames(rawSectionNames)

    const newSections = sortedSectionNames.map((name: string) => ({
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

    setSections(newSections)
    copyItemsRef.current = freshItems
    setCopyInfo({
      building: selectedEstimate.building,
      staff: selectedEstimate.staff,
      work_type: normalizeWorkType(selectedEstimate.work_type),
      draft_id: data.id,
      date: '',
      title: '',
    })
    setCopying(false)
    setShowEstimate(true)
  }

  const sortSectionNames = (names: string[]) => {
    const hasFirst = names.includes(FIRST_SECTION)
    const hasLast = names.includes(LAST_SECTION)
    const middle = names.filter(n => n !== FIRST_SECTION && n !== LAST_SECTION)
    const result: string[] = []
    if (hasFirst) result.push(FIRST_SECTION)
    result.push(...middle)
    if (hasLast) result.push(LAST_SECTION)
    return result
  }

  const loadUnits = async () => {
    const { data } = await supabase.from('settings').select('value').eq('key','units').single()
    if (data) setUnits(data.value as string[])
  }

  const loadAvailableYears = async () => {
    const { data } = await supabase
      .from('item_prices')
      .select('fiscal_year')
      .order('fiscal_year', { ascending: false })
    if (data) {
      const years = [...new Set(data.map((d: {fiscal_year: number}) => d.fiscal_year))] as number[]
      if (years.length > 0) {
        setAvailableYears(years)
        setFiscalYear(years[0])
      }
    }
  }

  const saveDraft = async () => {
    if (!copyInfo) return
    setSaving(true)
    const sectionsToSave = sections.map(s => ({
      ...s, rows: s.rows.map(r => ({ ...r, showCandidates: false }))
    }))
    const file_key = copyInfo.date && copyInfo.title
      ? `${copyInfo.date}_${copyInfo.building}_${copyInfo.title}_${copyInfo.staff}_${copyInfo.work_type}`
      : `copy_未入力_${copyInfo.draft_id}`
    await supabase.from('drafts').upsert({
      id: copyInfo.draft_id,
      file_key,
      date: copyInfo.date,
      building: copyInfo.building,
      title: copyInfo.title || 'コピー未入力',
      staff: copyInfo.staff,
      work_type: copyInfo.work_type,
      sections: sectionsToSave,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' })
    setSaving(false)
    setSavedMsg('保存しました！')
    setTimeout(() => setSavedMsg(''), 3000)
  }

  // ▼ V4.2.6修正: openPopup時にsectionsから直接name1を取得
  const openPopup = (sectionId: string, rowId: string, sectionName: string) => {
    setPopup({ sectionId, rowId, workSection: sectionName })
    setPopupSearch('')
    setPopupTab('history')
    // sectionsは既にstateにある→直接読める
    const section = sections.find(s => s.id === sectionId)
    const row = section?.rows.find(r => r.id === rowId)
    setCurrentRowName(row?.name1 || '')
    const filtered = copyItemsRef.current
      .filter(i => i.work_section === sectionName && i.name1)
      .map(i => ({
        id: i.id,
        name1: i.name1,
        name2: i.name2,
        name3: i.name3,
        spec1: i.spec1,
        spec2: i.spec2,
        spec3: i.spec3,
        unit: i.unit,
        unit_price: i.unit_price,
        note1: i.note1,
        note2: i.note2,
        note3: i.note3,
        estimate_id: i.estimate_id,
      }))
    setPopupItems(filtered)
    setPopupLoading(false)
  }

  const handleTabChange = async (tab: 'history' | 'master') => {
    setPopupTab(tab)
    setPopupSearch('')
    if (tab === 'master') {
      setPopupLoading(true)
      const { data } = await supabase
        .from('items')
        .select('id,name1,name2,name3,spec1,spec2,spec3,unit,item_prices(fiscal_year,price1)')
        .order('name1')
      setMasterItems(data || [])
      setPopupLoading(false)
    }
  }

  const applyItemToRow = (
    newData: Partial<Row>,
    sectionId: string,
    rowId: string,
    sectionName: string
  ) => {
    const doOverwrite = () => {
      setSections(prev => prev.map(s => {
        if (s.id !== sectionId) return s
        return {
          ...s, rows: s.rows.map(r => {
            if (r.id !== rowId) return r
            return { ...r, ...newData, amount: 0, showCandidates: false }
          })
        }
      }))
      setPopup(null)
    }

    const doInsert = () => {
      const row = { ...newRow(), ...newData, amount: 0 }
      setSections(prev => prev.map(s => {
        if (s.id !== sectionId) return s
        const idx = s.rows.findIndex(r => r.id === rowId)
        const newRows = [...s.rows]
        newRows.splice(idx + 1, 0, row)
        return { ...s, rows: newRows }
      }))
      setPopup(null)
    }

    // openPopup時に取得したcurrentRowNameを使う
    if (currentRowName) {
      const choice = window.confirm('書き換えますか？\nOK = 書き換え　キャンセル = 下に追加')
      if (choice) {
        doOverwrite()
      } else {
        doInsert()
      }
    } else {
      doOverwrite()
    }
  }

  const selectPopupItem = (item: PopupItem) => {
    if (!popup) return
    const newData: Partial<Row> = {
      name1: item.name1 || '', name2: item.name2 || '', name3: item.name3 || '',
      spec1: item.spec1 || '', spec2: item.spec2 || '', spec3: item.spec3 || '',
      unit: item.unit || '',
      unit_price: item.unit_price?.toString() || '',
      note1: item.note1 || '', note2: item.note2 || '', note3: item.note3 || '',
      source_estimate_item_id: item.id,
    }
    applyItemToRow(newData, popup.sectionId, popup.rowId, popup.workSection)
  }

  const selectMasterItem = (item: MasterItem) => {
    if (!popup) return
    const priceObj = item.item_prices?.find(p => p.fiscal_year === fiscalYear) || item.item_prices?.[0]
    const unit_price = priceObj?.price1?.toString() || ''
    const newData: Partial<Row> = {
      name1: item.name1 || '', name2: item.name2 || '', name3: item.name3 || '',
      spec1: item.spec1 || '', spec2: item.spec2 || '', spec3: item.spec3 || '',
      unit: item.unit || '', unit_price,
      note1: '', note2: '', note3: '',
      source_estimate_item_id: null,
    }
    applyItemToRow(newData, popup.sectionId, popup.rowId, popup.workSection)
  }

  const filteredPopupItems = popupItems.filter(item => {
    if (!popupSearch) return true
    const kw = popupSearch.toLowerCase()
    return (item.name1 || '').toLowerCase().includes(kw) || (item.spec1 || '').toLowerCase().includes(kw)
  })

  const uniquePopupItems = filteredPopupItems.filter((item, idx, arr) =>
    arr.findIndex(x => x.name1 === item.name1 && x.spec1 === item.spec1) === idx
  )

  const filteredMasterItems = masterItems.filter(item => {
    if (!popupSearch) return true
    const kw = popupSearch.toLowerCase()
    return (item.name1 || '').toLowerCase().includes(kw) || (item.spec1 || '').toLowerCase().includes(kw)
  })

  const newRow = (): Row => ({
    id: Math.random().toString(36).slice(2),
    name1:'', name2:'', name3:'',
    spec1:'', spec2:'', spec3:'',
    quantity:'', unit:'', unit_price:'', amount:0,
    note1:'', note2:'', note3:'',
    showCandidates:false,
    source_estimate_item_id: null
  })

  const insertRowAfter = (sectionId: string, rowId: string, sectionName: string) => {
    const row = newRow()
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      const idx = s.rows.findIndex(r => r.id === rowId)
      const newRows = [...s.rows]
      newRows.splice(idx + 1, 0, row)
      return { ...s, rows: newRows }
    }))
    openPopup(sectionId, row.id, sectionName)
  }

  const insertRowBefore = (sectionId: string, rowId: string, sectionName: string) => {
    const row = newRow()
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      const idx = s.rows.findIndex(r => r.id === rowId)
      const newRows = [...s.rows]
      newRows.splice(idx, 0, row)
      return { ...s, rows: newRows }
    }))
    openPopup(sectionId, row.id, sectionName)
  }

  const deleteRow = (sectionId: string, rowId: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, rows: s.rows.filter(r => r.id !== rowId) } : s
    ))
  }

  // ▼ V4.2.1修正: 工事区分削除にアラート追加
  const deleteSection = (id: string) => {
    const section = sections.find(s => s.id === id)
    if (!section) return
    if (!confirm(`「${section.name}」を削除しますか？\n（${section.rows.length}行の明細が全て消えます）`)) return
    setSections(prev => prev.filter(s => s.id !== id))
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

  const addSection = (name: string) => {
    if (!name.trim()) return
    setSections(prev => {
      const newSection = { id: Math.random().toString(36).slice(2), name, rows: [] }
      const withoutLast = prev.filter(s => s.name !== LAST_SECTION)
      const last = prev.find(s => s.name === LAST_SECTION)
      return last ? [...withoutLast, newSection, last] : [...withoutLast, newSection]
    })
    setCustomSection('')
    setShowSectionInput(false)
  }

  const subtotal = (s: Section) => s.rows.reduce((sum, r) => sum + r.amount, 0)
  const grandTotal = sections.reduce((sum, s) => sum + subtotal(s), 0)

  const handleExport = async () => {
    if (!copyInfo) return
    if (copying) {
      alert('データ読み込み中です。少し待ってください')
      return
    }
    if (sections.length === 0 || sections.every(s => s.rows.length === 0)) {
      alert('明細データがありません')
      return
    }
    if (!copyInfo.date && !copyInfo.title) {
      alert('日付と件名を入力してください')
      return
    }
    if (!copyInfo.date) {
      alert('日付を入力してください')
      return
    }
    if (!copyInfo.title) {
      alert('件名を入力してください')
      return
    }
    await saveDraft()
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: copyInfo.date,
        building: copyInfo.building,
        title: copyInfo.title,
        staff: copyInfo.staff,
        work_type: copyInfo.work_type,
        sections
      })
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const dateStr = copyInfo.date.replace(/-/g,'')
    a.download = `${dateStr}_${copyInfo.building}_${copyInfo.title}_${copyInfo.staff}_${copyInfo.work_type}.xlsx`
    a.click()
  }

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
    const subtotalVal = sectionItems.reduce((sum, i) => sum + (i.amount || 0), 0)
    const expTotal = expenses.reduce((sum, i) => sum + (i.amount || 0), 0)
    const total = Math.floor((subtotalVal + expTotal) / 100) * 100
    return { sectionItems, expenses, subtotal: subtotalVal, total }
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

  // ==================== ポップアップUI ====================
  const PopupUI = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-800 rounded-t-lg">
          <h3 className="text-white font-bold">品目選択 - {popup?.workSection}</h3>
          <button onClick={() => setPopup(null)} className="text-white hover:text-blue-200 text-xl">×</button>
        </div>

        {/* タブ */}
        <div className="flex border-b">
          <button
            onClick={() => handleTabChange('history')}
            className={`flex-1 py-2 text-sm font-medium ${popupTab === 'history' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
            過去見積
          </button>
          <button
            onClick={() => handleTabChange('master')}
            className={`flex-1 py-2 text-sm font-medium ${popupTab === 'master' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
            単価マスタ
          </button>
        </div>

        {/* 年度セレクト（masterタブのみ） */}
        {popupTab === 'master' && (
          <div className="px-3 pt-2 flex items-center gap-2">
            <span className="text-xs text-gray-500">年度:</span>
            <select
              className="border rounded px-2 py-1 text-xs"
              value={fiscalYear}
              onChange={e => setFiscalYear(Number(e.target.value))}>
              {availableYears.map(y => <option key={y} value={y}>{y}年度</option>)}
            </select>
          </div>
        )}

        {/* 検索 */}
        <div className="p-3 border-b">
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="名称・仕様で絞り込み"
            value={popupSearch}
            onChange={e => setPopupSearch(e.target.value)}
            autoFocus />
        </div>

        <div className="overflow-y-auto flex-1">
          {popupLoading ? (
            <div className="p-8 text-center text-gray-400">読み込み中...</div>
          ) : popupTab === 'history' ? (
            uniquePopupItems.length === 0 ? (
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
            )
          ) : (
            filteredMasterItems.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                {popupSearch ? '該当する品目がありません' : '品目データがありません'}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">名称</th>
                    <th className="p-2 text-left">仕様</th>
                    <th className="p-2 text-left w-12">単位</th>
                    <th className="p-2 text-right w-24">{fiscalYear}年度単価</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMasterItems.map(item => {
                    const priceObj = item.item_prices?.find(p => p.fiscal_year === fiscalYear)
                    return (
                      <tr key={item.id} className="border-t hover:bg-blue-50 cursor-pointer"
                        onClick={() => selectMasterItem(item)}>
                        <td className="p-2">
                          <div>{item.name1}</div>
                          {item.name2 && <div className="text-gray-400">{item.name2}</div>}
                        </td>
                        <td className="p-2 text-gray-500"><div>{item.spec1}</div></td>
                        <td className="p-2">{item.unit}</td>
                        <td className="p-2 text-right font-medium">
                          {priceObj ? priceObj.price1.toLocaleString() : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          )}
        </div>
        <div className="px-4 py-2 border-t text-xs text-gray-400 text-right">
          {popupTab === 'history' ? uniquePopupItems.length : filteredMasterItems.length}件表示
        </div>
      </div>
    </div>
  )

  // ==================== estimate画面 ====================
  if (showEstimate && copyInfo) {
    return (
      <main className="min-h-screen bg-gray-50">
        {/* ▼ V5.0.3: 3行固定ヘッダー */}
        <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
          {/* 1行目: 戻る・タイトル・バージョン */}
          <div className="flex items-center gap-2 px-2 py-1">
            <button
              onClick={() => { setShowEstimate(false); setSections([]) }}
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded font-medium text-xs">
              ← 戻る
            </button>
            <span className="text-sm font-bold text-gray-800">明細入力</span>
            <span className="bg-orange-500 text-xs text-white px-2 py-0.5 rounded">コピー編集中</span>
            <span className="ml-auto text-xs text-gray-400">{VERSION}</span>
          </div>
          {/* 2行目: 案件情報入力 */}
          <div className="px-2 pb-1 flex flex-wrap gap-1 items-end border-t">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-gray-400">日付<span className="text-red-400">*</span></label>
              <input type="date" className="border rounded px-1 py-0.5 text-xs w-32"
                value={copyInfo.date}
                onChange={e => setCopyInfo({...copyInfo, date: e.target.value})} />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-gray-400">ビル名</label>
              <select className="border rounded px-1 py-0.5 text-xs w-24"
                value={copyInfo.building}
                onChange={e => setCopyInfo({...copyInfo, building: e.target.value})}>
                {['新宿FT','新宿ESS'].map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
              <label className="text-xs text-gray-400">件名<span className="text-red-400">*</span></label>
              <input type="text" className="border rounded px-1 py-0.5 text-xs w-full"
                value={copyInfo.title}
                placeholder="件名を入力"
                onChange={e => setCopyInfo({...copyInfo, title: e.target.value})} />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-gray-400">担当者</label>
              <input type="text" className="border rounded px-1 py-0.5 text-xs w-16"
                value={copyInfo.staff}
                onChange={e => setCopyInfo({...copyInfo, staff: e.target.value})} />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-gray-400">種別</label>
              <select className="border rounded px-1 py-0.5 text-xs w-20"
                value={copyInfo.work_type}
                onChange={e => setCopyInfo({...copyInfo, work_type: e.target.value})}>
                {['A工事','B工事','C工事'].map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>
          {/* 3行目: 合計・ボタン */}
          <div className="px-2 py-1 flex items-center gap-2 border-t">
            <span className="text-sm font-bold text-gray-800">合計: {grandTotal.toLocaleString()} 円</span>
            <div className="ml-auto flex gap-2 items-center">
              {savedMsg && <span className="text-xs text-green-600">{savedMsg}</span>}
              <button onClick={saveDraft} disabled={saving}
                className="bg-yellow-500 text-white px-3 py-1 rounded text-xs font-medium hover:bg-yellow-600 disabled:opacity-50">
                {saving ? '保存中...' : '途中保存'}
              </button>
              <button onClick={handleExport}
                className="bg-green-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-green-700">
                Excel出力
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto p-4">
          {sections.map(section => (
            <div key={section.id} className="mb-6">
              <div className="flex items-center justify-between bg-blue-800 text-white px-4 py-2 rounded-t">
                <h2 className="text-lg font-bold">{section.name}</h2>
                <button
                  onClick={() => deleteSection(section.id)}
                  className="text-blue-200 hover:text-white text-sm">× 削除</button>
              </div>
              <div className="bg-white border border-t-0 rounded-b overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-left w-10">操作</th>
                      <th className="p-2 text-left w-44">名称</th>
                      <th className="p-2 text-left w-36">仕様</th>
                      <th className="p-2 text-right w-16">数量</th>
                      <th className="p-2 text-left w-16">単位</th>
                      <th className="p-2 text-right w-20">単価</th>
                      <th className="p-2 text-right w-22">金額</th>
                      <th className="p-2 text-left w-28">備考</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, rowIdx) => (
                      <tr key={row.id} className="border-t align-top">
                        <td className="p-1 align-top">
                          <div className="flex flex-col gap-0.5 items-center pt-1">
                            {rowIdx === 0 && (
                              <button
                                onClick={() => insertRowBefore(section.id, row.id, section.name)}
                                className="w-7 h-6 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs font-bold"
                                title="上に行挿入">＋</button>
                            )}
                            <button
                              onClick={() => openPopup(section.id, row.id, section.name)}
                              className="w-7 h-7 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm"
                              title="品目選択">📋</button>
                            <button
                              onClick={() => deleteRow(section.id, row.id)}
                              className="w-7 h-6 bg-red-100 hover:bg-red-200 text-red-600 rounded text-xs font-bold"
                              title="行削除">➖</button>
                            <button
                              onClick={() => insertRowAfter(section.id, row.id, section.name)}
                              className="w-7 h-6 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs font-bold"
                              title="下に行挿入">＋</button>
                          </div>
                        </td>
                        <td className="p-1">
                          <input className="w-full border rounded px-2 py-1 mb-1" value={row.name1} placeholder="名称1段目"
                            onChange={e => updateRow(section.id, row.id, 'name1', e.target.value)} />
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
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="p-2 flex justify-between items-center border-t">
                  <button
                    onClick={() => {
                      const row = newRow()
                      setSections(prev => prev.map(s =>
                        s.id === section.id ? { ...s, rows: [...s.rows, row] } : s
                      ))
                      openPopup(section.id, row.id, section.name)
                    }}
                    className="text-blue-600 hover:text-blue-800 text-sm">+ 行追加</button>
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

          {/* ▼ V5.0.3: フッター廃止（ヘッダーに移動済み） */}
        </div>

        {popup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-800 rounded-t-lg">
                <h3 className="text-white font-bold">品目選択 - {popup.workSection}</h3>
                <button onClick={() => setPopup(null)} className="text-white hover:text-blue-200 text-xl">×</button>
              </div>
              <div className="flex border-b">
                <button
                  onClick={() => handleTabChange('history')}
                  className={`flex-1 py-2 text-sm font-medium ${popupTab === 'history' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                  過去見積
                </button>
                <button
                  onClick={() => handleTabChange('master')}
                  className={`flex-1 py-2 text-sm font-medium ${popupTab === 'master' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                  単価マスタ
                </button>
              </div>
              {popupTab === 'master' && (
                <div className="px-3 pt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500">年度:</span>
                  <select className="border rounded px-2 py-1 text-xs"
                    value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
                    {availableYears.map(y => <option key={y} value={y}>{y}年度</option>)}
                  </select>
                </div>
              )}
              <div className="p-4 flex-1">
                {popupLoading ? (
                  <div className="p-8 text-center text-gray-400">読み込み中...</div>
                ) : popupTab === 'history' ? (
                  uniquePopupItems.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">このカテゴリの品目データがありません</div>
                  ) : (
                    <select size={10} className="w-full border rounded text-sm"
                      onChange={e => {
                        const item = uniquePopupItems[Number(e.target.value)]
                        if (item) selectPopupItem(item)
                      }}>
                      {uniquePopupItems.map((item, idx) => (
                        <option key={item.id} value={idx}>
                          {item.name1}{item.spec1 ? ` / ${item.spec1}` : ''}{item.unit ? ` / ${item.unit}` : ''}{item.unit_price ? ` / ${item.unit_price.toLocaleString()}円` : ''}
                        </option>
                      ))}
                    </select>
                  )
                ) : (
                  filteredMasterItems.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">品目データがありません</div>
                  ) : (
                    <select size={10} className="w-full border rounded text-sm"
                      onChange={e => {
                        const item = filteredMasterItems[Number(e.target.value)]
                        if (item) selectMasterItem(item)
                      }}>
                      {filteredMasterItems.map((item, idx) => {
                        const priceObj = item.item_prices?.find((p: {fiscal_year: number; price1: number}) => p.fiscal_year === fiscalYear)
                        return (
                          <option key={item.id} value={idx}>
                            {item.name1}{item.spec1 ? ` / ${item.spec1}` : ''}{item.unit ? ` / ${item.unit}` : ''}{priceObj ? ` / ${priceObj.price1.toLocaleString()}円` : ''}
                          </option>
                        )
                      })}
                    </select>
                  )
                )}
              </div>
              <div className="px-4 py-2 border-t text-xs text-gray-400 text-right">
                {popupTab === 'history' ? uniquePopupItems.length : filteredMasterItems.length}件表示
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
                const { sectionItems, expenses, subtotal: subtotalVal, total } = getSectionData(sectionName)
                return (
                  <div key={sectionName} className="mb-6">
                    <div className="bg-blue-800 text-white px-4 py-2 flex justify-between items-center">
                      <span className="font-bold text-sm">{sectionName}</span>
                      <span className="text-xs">小計 {fmt(subtotalVal)} 円</span>
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
