// ============================================================
// ディレクトリ: mitu-project/app/history/
// ファイル名: page.tsx
// バージョン: V6.2.5
// 更新: 2026/04/29
// 変更: V6.2.5 fix: 現場経費を引き算で計算（工事の計-税抜計）
// ============================================================
'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const VERSION = 'V6.2.5'
const DEFAULT_UNITS = ['m2','m','ヶ所','式','台','本','枚','校','人工']
const PRESET_SECTIONS = ['解体工事','内装工事','外部仕上工事','塗装工事','植栽工事','躯体工事','特殊仮設工事']
const FIRST_SECTION = '解体工事'
const LAST_SECTION = '特殊仮設工事'

const normalizeWorkType = (wt: string) =>
  wt.replace('Ａ', 'A').replace('Ｂ', 'B').replace('Ｃ', 'C')

type Estimate = {
  id: number; date: string; building: string
  title: string; staff: string; work_type: string
}
type EstimateItem = {
  id: number; estimate_id: number; work_section: string; row_order: number
  name1: string; name2: string|null; name3: string|null
  spec1: string|null; spec2: string|null; spec3: string|null
  quantity: number; unit: string; unit_price: number; amount: number
  note1: string|null; note2: string|null; note3: string|null
}
type MasterItem = {
  id: number; name1: string; name2: string|null; name3: string|null
  spec1: string|null; spec2: string|null; spec3: string|null
  unit: string|null; category: string|null
  item_prices: { fiscal_year: number; price1: number|null }[]
}
type PopupItem = {
  id: number; name1: string; name2: string|null; name3: string|null
  spec1: string|null; spec2: string|null; spec3: string|null
  unit: string|null; unit_price: number|null
  note1: string|null; note2: string|null; note3: string|null
  estimate_id: number
}
type Row = {
  id: string; name1: string; name2: string; name3: string
  spec1: string; spec2: string; spec3: string
  quantity: string; unit: string; unit_price: string; amount: number
  note1: string; note2: string; note3: string
  showCandidates: boolean; source_estimate_item_id: number|null
  nightWork: boolean; excludeHakobi: boolean
  laborRate: string; nightDeepRate: string
  source_flag: number
}
type Section = {
  id: string; name: string; rows: Row[]
  keihiOverride: number|null   // 仮設工事費（手動上書き可）
  unbanOverride: number|null   // 運搬費（手動上書き可）
  nightOverride: number|null   // 夜間割増費（手動上書き可）
  genbaOverride: number|null   // 現場経費（手動上書き可）
}
type Filters = { staff: string; building: string; workType: string; year: string }
type CopyInfo = {
  building: string; staff: string; work_type: string
  draft_id: number|null; date: string; title: string
  source_estimate_id: number|null; source_title: string
}
type CopyMode = 'A' | 'B' | 'C'
type Draft = {
  id: number; file_key: string; date: string; building: string
  title: string; staff: string; work_type: string
  sections: Section[]; updated_at: string; source_title: string|null
}

const t = (str: string|null|undefined, len: number) => (str || '').slice(0, len)

export default function HistoryPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate|null>(null)
  const [items, setItems] = useState<EstimateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [copying, setCopying] = useState(false)
  const [showTitleList, setShowTitleList] = useState(false)
  const [is2Pane, setIs2Pane] = useState(false)
  const [filters, setFilters] = useState<Filters>({ staff:'', building:'', workType:'', year:'' })
  const [showEstimate, setShowEstimate] = useState(false)
  const [copyInfo, setCopyInfo] = useState<CopyInfo|null>(null)
  const copyItemsRef = useRef<EstimateItem[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [customSection, setCustomSection] = useState('')
  const [showSectionInput, setShowSectionInput] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [pendingApply, setPendingApply] = useState<{ newData: Partial<Row>; sectionId: string; rowId: string }|null>(null)
  const [units, setUnits] = useState<string[]>(DEFAULT_UNITS)
  // ② モーダル
  const [copyMode, setCopyMode] = useState<CopyMode|null>(null)
  const [showCopyModeModal, setShowCopyModeModal] = useState(false)
  const [showDraftListModal, setShowDraftListModal] = useState(false)
  const [draftList, setDraftList] = useState<Draft[]>([])
  // ポップアップ
  const [popup, setPopup] = useState<{ sectionId:string; rowId:string; workSection:string }|null>(null)
  const [popupTab, setPopupTab] = useState<'history'|'master'|'direct'>('history')
  const [popupItems, setPopupItems] = useState<PopupItem[]>([])
  const [masterItems, setMasterItems] = useState<MasterItem[]>([])
  const [popupLoading, setPopupLoading] = useState(false)
  const [popupSearch] = useState('')
  const [directInput, setDirectInput] = useState({ name1:'', spec1:'', unit:'', unit_price:'' })
  const [fiscalYear, setFiscalYear] = useState<number>(2026)
  const [availableYears, setAvailableYears] = useState<number[]>([2026, 2025])
  const [currentRowName, setCurrentRowName] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  useEffect(() => { loadEstimates(); loadUnits(); loadAvailableYears() }, [])

  const loadEstimates = async () => {
    const { data } = await supabase.from('estimates')
      .select('id,date,building,title,staff,work_type').order('date', { ascending: false })
    const list = data || []
    setEstimates(list)
    if (list.length > 0) loadItems(list[0])
  }
  const loadItems = async (estimate: Estimate) => {
    setLoading(true); setSelectedEstimate(estimate)
    const { data } = await supabase.from('estimate_items').select('*')
      .eq('estimate_id', estimate.id).order('work_section').order('row_order')
    setItems(data || []); setLoading(false)
  }
  const handleTitleSelect = (estimate: Estimate) => { loadItems(estimate); setShowTitleList(false) }
  const resetFilters = () => { setFilters({ staff:'', building:'', workType:'', year:'' }); setShowTitleList(false) }
  const handleFilterChange = (nf: Filters) => {
    setFilters(nf)
    const f = estimates.filter(e => {
      if (nf.staff && e.staff !== nf.staff) return false
      if (nf.building && e.building !== nf.building) return false
      if (nf.workType && e.work_type !== nf.workType) return false
      if (nf.year && !e.date.startsWith(nf.year)) return false
      return true
    })
    if (f.length > 0) loadItems(f[0])
  }

  // 新規作成
  const handleNewEstimate = () => {
    setSections([{ id: Math.random().toString(36).slice(2), name: FIRST_SECTION, rows: [], keihiOverride: null, unbanOverride: null, nightOverride: null, genbaOverride: null }])
    setCopyInfo({
      building: '新宿FT', staff: '', work_type: 'A工事',
      draft_id: null, date: '', title: '',
      source_estimate_id: null, source_title: '',
    })
    setCopyMode(null)
    setShowEstimate(true)
  }

  // コピーボタン → 直接4択モーダルへ
  const handleCopyButtonClick = () => {
    if (!selectedEstimate) return
    setShowCopyModeModal(true)
  }

  // ② A/B/Cモードでコピー実行
  const handleCopyToEdit = async (mode: CopyMode) => {
    if (!selectedEstimate) return
    setShowCopyModeModal(false); setCopyMode(mode); setCopying(true)
    const { data: freshItems } = await supabase.from('estimate_items').select('*')
      .eq('estimate_id', selectedEstimate.id).order('work_section').order('row_order')
    if (!freshItems || freshItems.length === 0) {
      alert('明細データがありません'); setCopying(false); return
    }
    const normalItems = freshItems.filter((i: EstimateItem) => !i.work_section.startsWith('経費_'))
    const rawNames = [...new Set(normalItems.map((i: EstimateItem) => i.work_section))] as string[]
    const sortedNames = sortSectionNames(rawNames)
    const newSections = sortedNames.map((name: string) => ({
      id: Math.random().toString(36).slice(2), name,
      rows: normalItems.filter((i: EstimateItem) => i.work_section === name).map((item: EstimateItem) => ({
        id: Math.random().toString(36).slice(2),
        name1: item.name1||'', name2: item.name2||'', name3: item.name3||'',
        spec1: item.spec1||'', spec2: item.spec2||'', spec3: item.spec3||'',
        quantity: mode === 'B' ? '' : item.quantity?.toFixed(1) || '',
        unit: item.unit||'', unit_price: String(item.unit_price ?? ''),
        amount: mode === 'B' ? 0 : item.amount,
        note1: item.note1||'', note2: item.note2||'', note3: item.note3||'',
        showCandidates: false, source_estimate_item_id: item.id,
        nightWork: false, excludeHakobi: false, laborRate: '60', nightDeepRate: '0',
        source_flag: 1,  // 1=Excelから取り込んだデータのコピー
      })),
      keihiOverride: null, unbanOverride: null, nightOverride: null, genbaOverride: null,
    }))
    setSections(newSections); copyItemsRef.current = freshItems
    const file_key = `copy_${selectedEstimate.id}_${Date.now()}`
    const { data: draftData } = await supabase.from('drafts').insert({
      file_key,
      date: mode === 'A' ? selectedEstimate.date : '',
      building: selectedEstimate.building,
      title: mode === 'A' ? selectedEstimate.title : '',
      staff: selectedEstimate.staff,
      work_type: normalizeWorkType(selectedEstimate.work_type),
      sections: newSections,
      source_title: selectedEstimate.title,
      updated_at: new Date().toISOString()
    }).select('id').single()
    setCopyInfo({
      building: selectedEstimate.building, staff: selectedEstimate.staff,
      work_type: normalizeWorkType(selectedEstimate.work_type),
      draft_id: draftData ? draftData.id : null,
      date: mode === 'A' ? selectedEstimate.date : '',
      title: mode === 'A' ? selectedEstimate.title : '',
      source_estimate_id: mode === 'A' ? selectedEstimate.id : null,
      source_title: selectedEstimate.title,
    })
    setCopying(false); setShowEstimate(true)
  }

  const loadDrafts = async () => {
    const { data } = await supabase.from('drafts').select('*').order('updated_at', { ascending: false })
    setDraftList(data || [])
  }
  const handleDraftResume = (draft: Draft) => {
    setSections(draft.sections)
    setCopyInfo({
      building: draft.building, staff: draft.staff, work_type: draft.work_type,
      draft_id: draft.id, date: draft.date, title: draft.title,
      source_estimate_id: null, source_title: draft.source_title || '',
    })
    setCopyMode(null)
    setShowDraftListModal(false)
    setShowEstimate(true)
  }
  const handleDeleteDraft = async (draftId: number) => {
    if (!confirm('この途中保存を削除しますか？')) return
    await supabase.from('drafts').delete().eq('id', draftId)
    setDraftList(prev => prev.filter(d => d.id !== draftId))
  }

  const sortSectionNames = (names: string[]) => {
    const hasFirst = names.includes(FIRST_SECTION)
    const hasLast = names.includes(LAST_SECTION)
    const middle = names.filter(n => n !== FIRST_SECTION && n !== LAST_SECTION)
    return [...(hasFirst ? [FIRST_SECTION] : []), ...middle, ...(hasLast ? [LAST_SECTION] : [])]
  }
  const loadUnits = async () => {
    const { data } = await supabase.from('settings').select('value').eq('key','units').single()
    if (data) setUnits(data.value as string[])
  }
  const loadAvailableYears = async () => {
    const { data } = await supabase.from('item_prices').select('fiscal_year').order('fiscal_year', { ascending: false })
    if (data) {
      const years = [...new Set(data.map((d: {fiscal_year:number}) => d.fiscal_year))] as number[]
      if (years.length > 0) { setAvailableYears(years); setFiscalYear(years[0]) }
    }
  }

  const saveDraft = async () => {
    if (!copyInfo) return
    setSaving(true)
    const sectionsToSave = sections.map(s => ({ ...s, rows: s.rows.map(r => ({ ...r, showCandidates: false })) }))
    const file_key = copyInfo.date && copyInfo.title
      ? `${copyInfo.date}_${copyInfo.building}_${copyInfo.title}_${copyInfo.staff}_${copyInfo.work_type}`
      : `copy_未入力_${copyInfo.draft_id || Date.now()}`
    if (copyInfo.draft_id === null) {
      // draft_idがない場合（新規作成）は初回INSERT
      const { data } = await supabase.from('drafts').insert({
        file_key, date: copyInfo.date, building: copyInfo.building,
        title: copyInfo.title || 'コピー未入力', staff: copyInfo.staff,
        work_type: copyInfo.work_type, sections: sectionsToSave,
        source_title: copyInfo.source_title || null,
        updated_at: new Date().toISOString()
      }).select('id').single()
      if (data) setCopyInfo(prev => prev ? { ...prev, draft_id: data.id } : prev)
    } else {
      // draft_idがある場合は常にUPSERT
      await supabase.from('drafts').upsert({
        id: copyInfo.draft_id, file_key,
        date: copyInfo.date, building: copyInfo.building,
        title: copyInfo.title || 'コピー未入力', staff: copyInfo.staff,
        work_type: copyInfo.work_type, sections: sectionsToSave,
        source_title: copyInfo.source_title || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
    }
    setSaving(false); setSavedMsg('保存しました！'); setTimeout(() => setSavedMsg(''), 3000)
  }

  const handleConfirm = async () => {
    if (!copyInfo) return
    if (!copyInfo.date) { alert('日付を入力してください'); return }
    if (!copyInfo.title) { alert('件名を入力してください'); return }
    if (sections.length === 0 || sections.every(s => s.rows.length === 0)) { alert('明細データがありません'); return }
    if (!confirm(`「${copyInfo.title}」を確定してhistoryに登録しますか？\n確定後は編集できません。`)) return
    setConfirming(true)
    // estimates INSERT
    const { data: estData, error: estError } = await supabase.from('estimates').insert({
      date: copyInfo.date, building: copyInfo.building,
      title: copyInfo.title, staff: copyInfo.staff,
      work_type: copyInfo.work_type,
    }).select('id').single()
    if (estError || !estData) {
      alert('確定に失敗しました（estimates）'); setConfirming(false); return
    }
    const estimateId = estData.id
    // estimate_items INSERT（経費行は含まない・source_flag/row_order付き）
    const allRows: object[] = []
    sections.forEach(section => {
      section.rows.forEach((row, idx) => {
        allRows.push({
          estimate_id: estimateId,
          work_section: section.name,
          row_order: idx + 1,
          name1: row.name1, name2: row.name2 || null, name3: row.name3 || null,
          spec1: row.spec1 || null, spec2: row.spec2 || null, spec3: row.spec3 || null,
          quantity: parseFloat(row.quantity) || 0,
          unit: row.unit,
          unit_price: parseFloat(row.unit_price) || 0,
          amount: row.amount,
          note1: row.note1 || null, note2: row.note2 || null, note3: row.note3 || null,
          source_flag: row.source_flag,
        })
      })
    })
    const { error: itemsError } = await supabase.from('estimate_items').insert(allRows)
    if (itemsError) {
      alert('確定に失敗しました（estimate_items）'); setConfirming(false); return
    }
    // draftsから削除（draft_idがある場合）
    if (copyInfo.draft_id !== null) {
      await supabase.from('drafts').delete().eq('id', copyInfo.draft_id)
    }
    setConfirming(false)
    alert(`「${copyInfo.title}」を確定しました！`)
    // リセットしてhistory画面へ
    setSections([]); setCopyInfo(null); setCopyMode(null); setShowEstimate(false)
    loadEstimates()
  }

  const openPopup = (sectionId: string, rowId: string, sectionName: string) => {
    setPopup({ sectionId, rowId, workSection: sectionName })
    setPopupTab('history')
    const section = sections.find(s => s.id === sectionId)
    const row = section?.rows.find(r => r.id === rowId)
    setCurrentRowName(row?.name1 || '')
    const filtered = copyItemsRef.current
      .filter(i => i.work_section === sectionName && i.name1)
      .map(i => ({
        id: i.id, name1: i.name1, name2: i.name2, name3: i.name3,
        spec1: i.spec1, spec2: i.spec2, spec3: i.spec3,
        unit: i.unit, unit_price: i.unit_price,
        note1: i.note1, note2: i.note2, note3: i.note3, estimate_id: i.estimate_id,
      }))
    setPopupItems(filtered); setPopupLoading(false)
  }

  const handleTabChange = async (tab: 'history'|'master'|'direct') => {
    setPopupTab(tab)
    if (tab === 'master') {
      setPopupLoading(true)
      const { data } = await supabase.from('items')
        .select('id,name1,name2,name3,spec1,spec2,spec3,unit,category,item_prices(fiscal_year,price1)').order('name1')
      setMasterItems(data || []); setPopupLoading(false)
    }
  }

  const applyItemToRow = (newData: Partial<Row>, sectionId: string, rowId: string) => {
    const doOverwrite = () => {
      setSections(prev => prev.map(s => s.id !== sectionId ? s : {
        ...s, rows: s.rows.map(r => r.id !== rowId ? r : { ...r, ...newData, amount: 0, showCandidates: false })
      }))
      setPopup(null); setShowApplyModal(false); setPendingApply(null)
    }
    const doInsert = () => {
      const row = { ...newRow(), ...newData, amount: 0 }
      setSections(prev => prev.map(s => {
        if (s.id !== sectionId) return s
        const idx = s.rows.findIndex(r => r.id === rowId)
        const rows = [...s.rows]; rows.splice(idx + 1, 0, row)
        return { ...s, rows }
      }))
      setPopup(null); setShowApplyModal(false); setPendingApply(null)
    }
    if (currentRowName) {
      setPendingApply({ newData, sectionId, rowId })
      setShowApplyModal(true)
      // doOverwrite/doInsertはモーダルから呼ぶ
      // ここでは一旦保留
      return
    } else { doOverwrite() }
  }

  const selectPopupItem = (item: PopupItem) => {
    if (!popup) return
    applyItemToRow({
      name1: item.name1||'', name2: item.name2||'', name3: item.name3||'',
      spec1: item.spec1||'', spec2: item.spec2||'', spec3: item.spec3||'',
      unit: item.unit||'', unit_price: item.unit_price?.toString()||'',
      note1: item.note1||'', note2: item.note2||'', note3: item.note3||'',
      source_estimate_item_id: item.id,
    }, popup.sectionId, popup.rowId)
  }
  const selectMasterItem = (item: MasterItem) => {
    if (!popup) return
    const priceObj = item.item_prices?.find((p: { fiscal_year: number; price1: number|null }) => p.fiscal_year === fiscalYear) || item.item_prices?.[0]
    applyItemToRow({
      name1: item.name1||'', name2: item.name2||'', name3: item.name3||'',
      spec1: item.spec1||'', spec2: item.spec2||'', spec3: item.spec3||'',
      unit: item.unit||'', unit_price: priceObj?.price1 != null ? String(priceObj.price1) : '',
      note1:'', note2:'', note3:'', source_estimate_item_id: null,
    }, popup.sectionId, popup.rowId)
  }

  const uniquePopupItems = popupItems.filter((item, idx, arr) =>
    arr.findIndex(x => x.name1 === item.name1 && x.spec1 === item.spec1) === idx
  ).filter(item => {
    if (!popupSearch) return true
    const kw = popupSearch.toLowerCase()
    return (item.name1||'').toLowerCase().includes(kw) || (item.spec1||'').toLowerCase().includes(kw)
  })
  const filteredMasterItems = masterItems.filter(item => {
    if (selectedCategory && item.category !== selectedCategory) return false
    if (!popupSearch) return true
    const kw = popupSearch.toLowerCase()
    return (item.name1||'').toLowerCase().includes(kw) || (item.spec1||'').toLowerCase().includes(kw)
  })

  const newRow = (): Row => ({
    id: Math.random().toString(36).slice(2),
    name1:'', name2:'', name3:'', spec1:'', spec2:'', spec3:'',
    quantity:'', unit:'', unit_price:'', amount:0,
    note1:'', note2:'', note3:'', showCandidates:false,
    source_estimate_item_id: null,
    nightWork:false, excludeHakobi:false, laborRate:'60', nightDeepRate:'0',
    source_flag: 2,  // 2=アプリで新規作成
  })

  const insertRowAfter = (sectionId: string, rowId: string, sectionName: string) => {
    const row = newRow()
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      const idx = s.rows.findIndex(r => r.id === rowId)
      const rows = [...s.rows]; rows.splice(idx + 1, 0, row); return { ...s, rows }
    }))
    openPopup(sectionId, row.id, sectionName)
  }
  const insertRowBefore = (sectionId: string, rowId: string, sectionName: string) => {
    const row = newRow()
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      const idx = s.rows.findIndex(r => r.id === rowId)
      const rows = [...s.rows]; rows.splice(idx, 0, row); return { ...s, rows }
    }))
    openPopup(sectionId, row.id, sectionName)
  }
  const deleteRow = (sectionId: string, rowId: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, rows: s.rows.filter(r => r.id !== rowId) } : s))
  }
  const deleteSection = (id: string) => {
    const section = sections.find(s => s.id === id)
    if (!section) return
    if (!confirm(`「${section.name}」を削除しますか？\n（${section.rows.length}行の明細が全て消えます）`)) return
    setSections(prev => prev.filter(s => s.id !== id))
  }
  const updateRow = (sectionId: string, rowId: string, field: string, value: string) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      return { ...s, rows: s.rows.map(r => {
        if (r.id !== rowId) return r
        const updated = { ...r, [field]: value }
        updated.amount = Math.round((parseFloat(updated.quantity)||0) * (parseFloat(updated.unit_price)||0) * 10) / 10
        return updated
      })}
    }))
  }
  const toggleRowBool = (sectionId: string, rowId: string, field: 'nightWork'|'excludeHakobi') => {
    setSections(prev => prev.map(s => s.id !== sectionId ? s : {
      ...s, rows: s.rows.map(r => r.id !== rowId ? r : { ...r, [field]: !r[field] })
    }))
  }
  const addSection = (name: string) => {
    if (!name.trim()) return
    setSections(prev => {
      const newS = { id: Math.random().toString(36).slice(2), name, rows: [], keihiOverride: null, unbanOverride: null, nightOverride: null, genbaOverride: null }
      const withoutLast = prev.filter(s => s.name !== LAST_SECTION)
      const last = prev.find(s => s.name === LAST_SECTION)
      return last ? [...withoutLast, newS, last] : [...withoutLast, newS]
    })
    setCustomSection(''); setShowSectionInput(false)
  }

  const subtotal = (s: Section) => s.rows.reduce((sum, r) => sum + r.amount, 0)
  const getNightCost = (section: Section) => {
    if (section.nightOverride !== null) return section.nightOverride
    return Math.floor(section.rows.filter(r => r.nightWork).reduce((sum, r) => {
      const labor = (parseFloat(r.laborRate)||60) / 100
      const deep = (parseFloat(r.nightDeepRate)||0) / 100
      return sum + (r.amount * labor * 0.5) + (r.amount * labor * deep)
    }, 0) / 10) * 10
  }
  const getHakobiCost = (section: Section) => section.unbanOverride !== null ? section.unbanOverride :
    Math.floor(section.rows.filter(r => !r.excludeHakobi).reduce((sum, r) => sum + r.amount, 0) * 0.02 / 10) * 10
  const getKeihiCost = (section: Section) => section.keihiOverride !== null ? section.keihiOverride :
    Math.floor(subtotal(section) * 0.07 / 10) * 10
  // 税抜計 = 小計 + 仮設 + 運搬 + 夜間
  const getZeinukiTotal = (section: Section) =>
    subtotal(section) + getKeihiCost(section) + getHakobiCost(section) + getNightCost(section)
  // 工事の計 = 税抜計 × 110% → 100円単位切り捨て
  const getSectionTotal = (section: Section) =>
    Math.floor(getZeinukiTotal(section) * 1.10 / 100) * 100
  // 現場経費 = 工事の計 - 税抜計（引き算・小数点誤差なし）
  const getGenbaCost = (section: Section) => section.genbaOverride !== null ? section.genbaOverride :
    getSectionTotal(section) - getZeinukiTotal(section)
  const grandTotal = sections.reduce((sum, s) => sum + getSectionTotal(s), 0)

  const updateSectionExpense = (sectionId: string, field: 'keihiOverride'|'unbanOverride'|'nightOverride'|'genbaOverride', value: string) => {
    setSections(prev => prev.map(s => s.id !== sectionId ? s : {
      ...s, [field]: value === '' ? null : Math.round(parseFloat(value)||0)
    }))
  }

  const handleExport = async () => {
    if (!copyInfo) return
    if (copying) { alert('データ読み込み中です'); return }
    if (sections.length === 0 || sections.every(s => s.rows.length === 0)) { alert('明細データがありません'); return }
    if (!copyInfo.date) { alert('日付を入力してください'); return }
    if (!copyInfo.title) { alert('件名を入力してください'); return }
    await saveDraft()
    const res = await fetch('/api/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: copyInfo.date, building: copyInfo.building, title: copyInfo.title, staff: copyInfo.staff, work_type: copyInfo.work_type, sections })
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${copyInfo.date.replace(/-/g,'')}_${copyInfo.building}_${copyInfo.title}_${copyInfo.staff}_${copyInfo.work_type}.xlsx`
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
  const years = [...new Set(estimates.map(e => e.date.slice(0,4)))].sort().reverse()

  const SECTION_ORDER = ['解体工事','内装工事','特殊仮設工事','外部仕上工事','塗装工事','植栽工事','躯体工事']
  const normalItems = items.filter(i => !i.work_section.startsWith('経費_'))
  const sectionNames = [...new Set(normalItems.map(i => i.work_section))].sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a), bi = SECTION_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1; if (bi === -1) return -1; return ai - bi
  })
  const fmt = (n: number) => Math.round(n).toLocaleString()
  const getSectionData = (sectionName: string) => {
    const sectionItems = normalItems.filter(i => i.work_section === sectionName)
    const expenses = items.filter(i => i.work_section === `経費_${sectionName}`)
    const subtotalVal = sectionItems.reduce((sum, i) => sum + (i.amount||0), 0)
    const expTotal = expenses.reduce((sum, i) => sum + (i.amount||0), 0)
    return { sectionItems, expenses, subtotal: subtotalVal, total: Math.floor((subtotalVal + expTotal) / 100) * 100 }
  }
  const historyGrandTotal = sectionNames.reduce((sum, name) => sum + getSectionData(name).total, 0)

  const handleExportHistory = async () => {
    if (!selectedEstimate) return
    const exportSections = sectionNames.map(name => {
      const { sectionItems } = getSectionData(name)
      return { id: name, name, rows: sectionItems.map(item => ({
        id: String(item.id), name1: item.name1||'', name2: item.name2||'', name3: item.name3||'',
        spec1: item.spec1||'', spec2: item.spec2||'', spec3: item.spec3||'',
        quantity: String(item.quantity), unit: item.unit||'',
        unit_price: String(item.unit_price), amount: item.amount,
        note1: item.note1||'', note2: item.note2||'', note3: item.note3||'',
        candidates: [], showCandidates: false,
      }))}
    })
    const res = await fetch('/api/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: selectedEstimate.date, building: selectedEstimate.building, title: selectedEstimate.title, staff: selectedEstimate.staff, work_type: selectedEstimate.work_type, sections: exportSections })
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedEstimate.date.replace(/-/g,'')}_${selectedEstimate.building}_${selectedEstimate.title}_${selectedEstimate.staff}_${selectedEstimate.work_type}.xlsx`
    a.click()
  }

  const colWidths = { no:'3%', name:'26%', spec:'24%', qty:'6%', unit:'4%', price:'10%', amount:'11%', note:'16%' }

  // ② モードバッジ
  const modeBadge = (mode: CopyMode|null) => {
    if (!mode) return null
    const map = {
      A: { label: 'Aモード: 上書き編集', color: 'bg-red-500' },
      B: { label: 'Bモード: コピー（数量なし）', color: 'bg-blue-500' },
      C: { label: 'Cモード: コピー（数量あり）', color: 'bg-orange-500' },
    }
    const m = map[mode]
    return <span className={`${m.color} text-white text-xs px-2 py-0.5 rounded`}>{m.label}</span>
  }

  // ==================== ② コピーモード選択モーダル ====================
  const renderCopyModeModal = () => !showCopyModeModal ? null : (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-4 border-b">
          <h2 className="text-base font-bold text-gray-800">コピー方法を選択</h2>
          <p className="text-xs text-gray-500 mt-1">{selectedEstimate?.title}</p>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <button onClick={() => handleCopyToEdit('A')}
            className="w-full text-left border-2 border-red-200 rounded-lg px-4 py-3 hover:bg-red-50 transition-colors">
            <div className="font-bold text-red-700 text-sm">A: 上書き編集</div>
            <div className="text-xs text-gray-500 mt-1">件名・数量そのまま。元データを上書き保存します。</div>
          </button>
          <button onClick={() => handleCopyToEdit('B')}
            className="w-full text-left border-2 border-blue-200 rounded-lg px-4 py-3 hover:bg-blue-50 transition-colors">
            <div className="font-bold text-blue-700 text-sm">B: コピー（数量なし）</div>
            <div className="text-xs text-gray-500 mt-1">品目・単価はコピー。数量は新規入力。新しい件名で保存。</div>
          </button>
          <button onClick={() => handleCopyToEdit('C')}
            className="w-full text-left border-2 border-orange-200 rounded-lg px-4 py-3 hover:bg-orange-50 transition-colors">
            <div className="font-bold text-orange-700 text-sm">C: コピー（数量あり）</div>
            <div className="text-xs text-gray-500 mt-1">全項目をそのままコピー。数量含めて複製。新しい件名で保存。</div>
          </button>
          <button onClick={() => { setShowCopyModeModal(false); loadDrafts(); setShowDraftListModal(true) }}
            className="w-full text-left border-2 border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors">
            <div className="font-bold text-gray-700 text-sm">D: 途中保存から再開</div>
            <div className="text-xs text-gray-500 mt-1">保存済みの下書き一覧から選んで編集を再開。</div>
          </button>
        </div>
        <div className="px-4 pb-4">
          <button onClick={() => setShowCopyModeModal(false)}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 border rounded-lg">キャンセル</button>
        </div>
      </div>
    </div>
  )

  // ==================== D: 途中保存一覧モーダル ====================
  const renderDraftListModal = () => !showDraftListModal ? null : (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-base font-bold text-gray-800">途中保存から再開</h2>
          <button onClick={() => setShowDraftListModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {draftList.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">途中保存はありません</div>
          ) : draftList.map(draft => (
            <div key={draft.id} className="border rounded-lg px-4 py-3 flex justify-between items-center hover:bg-gray-50">
              <div className="flex-1 cursor-pointer" onClick={() => handleDraftResume(draft)}>
                <div className="font-medium text-sm text-gray-800">{draft.title || '（件名未入力）'}</div>
                {draft.source_title && (
                  <div className="text-xs text-blue-500 mt-0.5">コピー元: {draft.source_title}</div>
                )}
                <div className="text-xs text-gray-500 mt-0.5">
                  {draft.date || '日付未入力'} / {draft.building} / {draft.staff} / {draft.work_type}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  保存: {new Date(draft.updated_at).toLocaleString('ja-JP')}
                </div>
              </div>
              <button onClick={() => handleDeleteDraft(draft.id)}
                className="ml-2 text-red-400 hover:text-red-600 text-xs px-2 py-1 border border-red-200 rounded">
                削除
              </button>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4 border-t pt-3">
          <button onClick={() => setShowDraftListModal(false)}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 border rounded-lg">キャンセル</button>
        </div>
      </div>
    </div>
  )

  // ==================== 3択モーダル（書き換え・下追加・キャンセル）====================
  const renderApplyModal = () => !showApplyModal || !pendingApply ? null : (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs">
        <div className="px-5 py-4 border-b">
          <h2 className="text-sm font-bold text-gray-800">この品目をどうしますか？</h2>
          <p className="text-xs text-gray-500 mt-1">現在の行: 「{currentRowName}」</p>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <button
            onClick={() => {
              const { newData, sectionId, rowId } = pendingApply
              setSections(prev => prev.map(s => s.id !== sectionId ? s : {
                ...s, rows: s.rows.map(r => r.id !== rowId ? r : { ...r, ...newData, amount: 0, showCandidates: false })
              }))
              setPopup(null); setShowApplyModal(false); setPendingApply(null)
            }}
            className="w-full border-2 border-red-200 rounded-lg px-4 py-3 text-left hover:bg-red-50"
            title="現在の行の内容を選んだ品目で上書きします">
            <div className="font-bold text-red-700 text-sm">書き換え</div>
            <div className="text-xs text-gray-400 mt-0.5">現在の行を選んだ品目で上書き</div>
          </button>
          <button
            onClick={() => {
              const { newData, sectionId, rowId } = pendingApply
              const row = { ...newRow(), ...newData, amount: 0 }
              setSections(prev => prev.map(s => {
                if (s.id !== sectionId) return s
                const idx = s.rows.findIndex(r => r.id === rowId)
                const rows = [...s.rows]; rows.splice(idx + 1, 0, row)
                return { ...s, rows }
              }))
              setPopup(null); setShowApplyModal(false); setPendingApply(null)
            }}
            className="w-full border-2 border-blue-200 rounded-lg px-4 py-3 text-left hover:bg-blue-50"
            title="現在の行はそのまま残して、下に新しい行を追加します">
            <div className="font-bold text-blue-700 text-sm">下に追加</div>
            <div className="text-xs text-gray-400 mt-0.5">現在の行を残して下に新しい行を追加</div>
          </button>
          <button
            onClick={() => { setShowApplyModal(false); setPendingApply(null) }}
            className="w-full border rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
            title="品目選択に戻ります">
            キャンセル（品目選択に戻る）
          </button>
        </div>
      </div>
    </div>
  )

  // ==================== ポップアップ JSX ====================
  const renderPopup = () => !popup ? null : (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-800 rounded-t-lg">
          <h3 className="text-white font-bold">品目選択 - {popup.workSection}</h3>
          <button onClick={() => setPopup(null)} className="text-white hover:text-blue-200 text-xl">×</button>
        </div>
        <div className="flex border-b">
          <button onClick={() => handleTabChange('history')}
            className={`flex-1 py-2 text-sm font-medium ${popupTab==='history' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
            過去見積</button>
          <button onClick={() => handleTabChange('master')}
            className={`flex-1 py-2 text-sm font-medium ${popupTab==='master' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
            単価マスタ</button>
          <button onClick={() => handleTabChange('direct')}
            className={`flex-1 py-2 text-sm font-medium ${popupTab==='direct' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
            直接入力</button>
        </div>
        {popupTab === 'master' && (
          <div className="px-3 pt-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">年度:</span>
            <select className="border rounded px-2 py-1 text-xs" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
              {availableYears.map(y => <option key={y} value={y}>{y}年度</option>)}
            </select>
            <span className="text-xs text-gray-500">カテゴリ:</span>
            <select className="border rounded px-2 py-1 text-xs" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
              <option value="">全て</option>
              {['解体','天井','壁','床','建具','塗装','防水','ブラインド','金物・錠','サイン・フィルム','養生・仮設','経費・諸費用'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
        <div className="p-4 flex-1">
          {popupLoading ? <div className="p-8 text-center text-gray-400">読み込み中...</div>
          : popupTab === 'direct' ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">名称<span className="text-red-400">*</span></label>
                <input className="border rounded px-3 py-2 text-sm" value={directInput.name1}
                  placeholder="名称を入力" onChange={e => setDirectInput(p => ({ ...p, name1: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">仕様</label>
                <input className="border rounded px-3 py-2 text-sm" value={directInput.spec1}
                  placeholder="仕様を入力" onChange={e => setDirectInput(p => ({ ...p, spec1: e.target.value }))} />
              </div>
              <div className="flex gap-3">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-gray-500">単位</label>
                  <select className="border rounded px-2 py-2 text-sm" value={directInput.unit}
                    onChange={e => setDirectInput(p => ({ ...p, unit: e.target.value }))}>
                    <option value="">選択</option>
                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-gray-500">単価</label>
                  <input type="number" className="border rounded px-3 py-2 text-sm text-right" value={directInput.unit_price}
                    placeholder="0" onChange={e => setDirectInput(p => ({ ...p, unit_price: e.target.value }))} />
                </div>
              </div>
              <button
                onClick={() => {
                  if (!directInput.name1.trim()) { alert('名称を入力してください'); return }
                  if (!popup) return
                  applyItemToRow({
                    name1: directInput.name1, name2: '', name3: '',
                    spec1: directInput.spec1, spec2: '', spec3: '',
                    unit: directInput.unit, unit_price: directInput.unit_price,
                    note1: '', note2: '', note3: '',
                    source_estimate_item_id: null,
                  }, popup.sectionId, popup.rowId)
                  setDirectInput({ name1:'', spec1:'', unit:'', unit_price:'' })
                }}
                className="bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700">
                この内容で追加
              </button>
            </div>
          ) : popupTab === 'history' ? (
            uniquePopupItems.length === 0
              ? <div className="p-8 text-center text-gray-400">このカテゴリの品目データがありません</div>
              : <select size={10} className="w-full border rounded text-sm"
                  onChange={e => { const item = uniquePopupItems[Number(e.target.value)]; if (item) selectPopupItem(item) }}>
                  {uniquePopupItems.map((item, idx) => (
                    <option key={item.id} value={idx}>
                      {item.name1}{item.spec1 ? ` / ${item.spec1}` : ''}{item.unit ? ` / ${item.unit}` : ''}{item.unit_price ? ` / ${item.unit_price.toLocaleString()}円` : ''}
                    </option>
                  ))}
                </select>
          ) : (
            filteredMasterItems.length === 0
              ? <div className="p-8 text-center text-gray-400">品目データがありません</div>
              : <select size={10} className="w-full border rounded text-sm"
                  onChange={e => { const item = filteredMasterItems[Number(e.target.value)]; if (item) selectMasterItem(item) }}>
                  {filteredMasterItems.map((item, idx) => {
                    const priceObj = item.item_prices?.find((p: { fiscal_year: number; price1: number|null }) => p.fiscal_year === fiscalYear)
                    return (
                      <option key={item.id} value={idx}>
                        {item.name1}{item.spec1 ? ` / ${item.spec1}` : ''}{item.unit ? ` / ${item.unit}` : ''}{priceObj?.price1 != null ? ` / ${priceObj.price1.toLocaleString()}円` : ''}
                      </option>
                    )
                  })}
                </select>
          )}
        </div>
        <div className="px-4 py-2 border-t text-xs text-gray-400 text-right">
          {popupTab === 'history' ? uniquePopupItems.length : filteredMasterItems.length}件表示
        </div>
      </div>
    </div>
  )

  // ==================== コピー編集エリア JSX ====================
  const renderEstimate = () => (
    <main className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
        {/* 1行目 */}
        <div className="flex items-center gap-2 px-2 py-1 flex-wrap">
          <button onClick={() => { setShowEstimate(false); setSections([]); setCopyInfo(null); setCopyMode(null) }}
            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded font-medium text-xs"
            title="history画面に戻る">← 戻る</button>
          <span className="text-sm font-bold text-gray-800">明細入力</span>
          {modeBadge(copyMode)}
          <span className="ml-auto text-xs text-gray-400">{VERSION}</span>
        </div>
        {/* 2行目: 案件情報 */}
        <div className="px-2 pb-1 flex flex-wrap gap-1 items-end border-t">
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-400">日付<span className="text-red-400">*</span></label>
            <input type="date" className="border rounded px-1 py-0.5 text-xs w-32" value={copyInfo!.date}
              onChange={e => setCopyInfo({...copyInfo!, date: e.target.value})} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-400">ビル名</label>
            <select className="border rounded px-1 py-0.5 text-xs w-24" value={copyInfo!.building}
              onChange={e => setCopyInfo({...copyInfo!, building: e.target.value})}>
              {['新宿FT','新宿ESS'].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
            <label className="text-xs text-gray-400">件名<span className="text-red-400">*</span></label>
            <input type="text" className="border rounded px-1 py-0.5 text-xs w-full" value={copyInfo!.title}
              placeholder="件名を入力" onChange={e => setCopyInfo({...copyInfo!, title: e.target.value})} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-400">担当者</label>
            <input type="text" className="border rounded px-1 py-0.5 text-xs w-16" value={copyInfo!.staff}
              onChange={e => setCopyInfo({...copyInfo!, staff: e.target.value})} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-400">種別</label>
            <select className="border rounded px-1 py-0.5 text-xs w-20" value={copyInfo!.work_type}
              onChange={e => setCopyInfo({...copyInfo!, work_type: e.target.value})}>
              {['A工事','B工事','C工事'].map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        </div>
        {/* 3行目: 合計・ボタン */}
        <div className="px-2 py-1 flex items-center gap-2 border-t">
          <span className="text-sm font-bold text-gray-800">合計: {grandTotal.toLocaleString()} 円</span>
          <div className="ml-auto flex gap-2 items-center">
            {savedMsg && <span className="text-xs text-green-600">{savedMsg}</span>}
            {/* 2画面トグル */}
            {is2Pane ? (
              <button onClick={() => setIs2Pane(false)}
                className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs font-bold"
                title="1画面モードに切り替え">1画面</button>
            ) : (
              <button onClick={() => setIs2Pane(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-bold"
                title="2画面モードに切り替え">2画面</button>
            )}
            <button onClick={saveDraft} disabled={saving}
              className="bg-yellow-500 text-white px-3 py-1 rounded text-xs font-medium hover:bg-yellow-600 disabled:opacity-50"
              title="作業中のデータを一時保存。日付・件名なしでも保存可">
              {saving ? '保存中...' : '保存'}</button>
            <button onClick={handleConfirm} disabled={confirming}
              className="bg-red-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50"
              title="見積を完成させて一覧に登録します。日付・件名が必要。">
              {confirming ? '確定中...' : '確定'}</button>
            <button onClick={handleExport}
              className="bg-green-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-green-700"
              title="Excel出力（日付・件名必須）">Excel出力</button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        {sections.map(section => {
          return (
            <div key={section.id} className="mb-6">
              <div className="flex items-center justify-between bg-blue-800 text-white px-4 py-2 rounded-t">
                <h2 className="text-lg font-bold">{section.name}</h2>
                <button onClick={() => deleteSection(section.id)} className="text-blue-200 hover:text-white text-sm"
                  title="この工事区分を削除">× 削除</button>
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
                      <th className="p-2 text-center w-12" title="夜=夜間作業 / 搬=搬入費除外（赤）">夜搬</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, rowIdx) => (
                      <tr key={row.id} className="border-t align-top">
                        <td className="p-1 align-top">
                          <div className="flex flex-col gap-0.5 items-center pt-1">
                            {rowIdx === 0 && (
                              <button onClick={() => insertRowBefore(section.id, row.id, section.name)}
                                className="w-7 h-6 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs font-bold"
                                title="上に行挿入">＋</button>
                            )}
                            <button onClick={() => openPopup(section.id, row.id, section.name)}
                              className="w-7 h-7 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm"
                              title="品目選択">📋</button>
                            <button onClick={() => deleteRow(section.id, row.id)}
                              className="w-7 h-6 bg-red-100 hover:bg-red-200 text-red-600 rounded text-xs font-bold"
                              title="この行を削除">➖</button>
                            <button onClick={() => insertRowAfter(section.id, row.id, section.name)}
                              className="w-7 h-6 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs font-bold"
                              title="下に行挿入">＋</button>
                          </div>
                        </td>
                        <td className="p-1">
                          {['name1','name2','name3'].map((f,i) => (
                            <input key={f} className={`w-full border rounded px-2 py-1 ${i<2?'mb-1':''}`}
                              value={row[f as keyof Row] as string} placeholder={`名称${i+1}段目`}
                              onChange={e => updateRow(section.id, row.id, f, e.target.value)} />
                          ))}
                        </td>
                        <td className="p-1">
                          {['spec1','spec2','spec3'].map((f,i) => (
                            <input key={f} className={`w-full border rounded px-2 py-1 ${i<2?'mb-1':''}`}
                              value={row[f as keyof Row] as string} placeholder={`仕様${i+1}段目`}
                              onChange={e => updateRow(section.id, row.id, f, e.target.value)} />
                          ))}
                        </td>
                        {/* ⑤ 数量: onBlurでtoFixed(1) */}
                        <td className="p-1">
                          <input className="w-full border rounded px-2 py-1 text-right"
                            value={row.quantity} type="number" step="0.1"
                            onChange={e => updateRow(section.id, row.id, 'quantity', e.target.value)}
                            onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateRow(section.id, row.id, 'quantity', v.toFixed(1)) }} />
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
                          {['note1','note2','note3'].map((f,i) => (
                            <input key={f} className={`w-full border rounded px-2 py-1 ${i<2?'mb-1':''}`}
                              value={row[f as keyof Row] as string} placeholder={`備考${i+1}段目`}
                              onChange={e => updateRow(section.id, row.id, f, e.target.value)} />
                          ))}
                        </td>
                        {/* ④ 夜搬列 */}
                        <td className="p-1 align-top">
                          <div className="flex flex-col gap-1 items-center pt-1">
                            <button onClick={() => toggleRowBool(section.id, row.id, 'nightWork')}
                              className={`w-8 h-6 rounded text-xs font-bold transition-colors ${row.nightWork ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                              title="夜間作業チェック（青＝対象）">夜</button>
                            <button onClick={() => toggleRowBool(section.id, row.id, 'excludeHakobi')}
                              className={`w-8 h-6 rounded text-xs font-bold transition-colors ${row.excludeHakobi ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                              title="搬入費から除外（赤＝除外中）">搬</button>
                          </div>
                          {row.nightWork && (
                            <div className="flex flex-col gap-0.5 mt-1 items-center">
                              <span className="text-xs text-gray-400">労%</span>
                              <input type="number" className="w-10 border rounded px-1 py-0.5 text-xs text-right bg-blue-50"
                                value={row.laborRate} min="40" max="80" step="5"
                                title="労務費率（40〜80%）"
                                onChange={e => updateRow(section.id, row.id, 'laborRate', e.target.value)} />
                              <span className="text-xs text-gray-400">深%</span>
                              <input type="number" className="w-10 border rounded px-1 py-0.5 text-xs text-right bg-blue-50"
                                value={row.nightDeepRate} min="0" max="30" step="5"
                                title="深夜割増率（0〜30%）"
                                onChange={e => updateRow(section.id, row.id, 'nightDeepRate', e.target.value)} />
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="p-2 flex justify-between items-center border-t">
                  <button onClick={() => {
                    const row = newRow()
                    setSections(prev => prev.map(s => s.id === section.id ? { ...s, rows: [...s.rows, row] } : s))
                    openPopup(section.id, row.id, section.name)
                  }} className="text-blue-600 hover:text-blue-800 text-sm" title="行を追加">+ 行追加</button>
                  <div className="text-sm font-medium">小計: {subtotal(section).toLocaleString()} 円</div>
                </div>
              </div>
              {/* 経費エリア（6行） */}
              <div className="border border-t-0 rounded-b bg-gray-50">
                {(() => {
                  const sub = subtotal(section)
                  const keihi = getKeihiCost(section)
                  const unban = getHakobiCost(section)
                  const night = getNightCost(section)
                  const zeinuki = sub + keihi + unban + night
                  const genba = getGenbaCost(section)
                  const total = getSectionTotal(section)
                  return [
                    { label: '小計', autoValue: sub, field: null },
                    { label: '仮設工事費（7%）', autoValue: Math.floor(sub * 0.07 / 10) * 10, field: 'keihiOverride' as const },
                    { label: '運搬費（2%）', autoValue: Math.floor(section.rows.filter(r => !r.excludeHakobi).reduce((s, r) => s + r.amount, 0) * 0.02 / 10) * 10, field: 'unbanOverride' as const },
                    { label: '夜間割増費', autoValue: Math.floor(section.rows.filter(r => r.nightWork).reduce((s, r) => { const l=(parseFloat(r.laborRate)||60)/100; const d=(parseFloat(r.nightDeepRate)||0)/100; return s+(r.amount*l*0.5)+(r.amount*l*d) }, 0) / 10) * 10, field: 'nightOverride' as const },
                    { label: '現場経費', autoValue: Math.floor(zeinuki * 1.10 / 100) * 100 - zeinuki, field: 'genbaOverride' as const },
                    { label: `${section.name}の計`, autoValue: total, field: null },
                  ].map(({ label, autoValue, field }, idx) => {
                    const overrideVal = field ? section[field] : null
                    return (
                      <div key={idx} className={`flex items-center gap-2 px-3 py-1.5 border-t text-xs ${idx === 5 ? 'bg-gray-200 font-bold text-sm' : 'text-gray-600'}`}>
                        <span className="w-40 shrink-0">{label}</span>
                        <span className="w-24 text-right text-gray-500">{(autoValue||0).toLocaleString()}</span>
                        {field ? (
                          <div className="flex items-center gap-1 ml-auto">
                            {overrideVal !== null && (
                              <button onClick={() => updateSectionExpense(section.id, field, '')}
                                className="text-gray-400 hover:text-red-500 text-xs" title="自動計算に戻す">↩</button>
                            )}
                            <input
                              type="number"
                              className={`border rounded px-2 py-0.5 text-xs text-right w-24 ${overrideVal !== null ? 'border-blue-400 bg-blue-50 font-bold' : 'bg-white border-gray-300'}`}
                              value={overrideVal !== null ? String(overrideVal) : ''}
                              placeholder="上書き"
                              onChange={e => updateSectionExpense(section.id, field, e.target.value)}
                            />
                            <span className={`text-sm font-bold w-28 text-right ${overrideVal !== null ? 'text-blue-600' : 'text-gray-700'}`}>
                              {(overrideVal !== null ? overrideVal : autoValue||0).toLocaleString()} 円
                            </span>
                          </div>
                        ) : (
                          <span className="ml-auto font-bold">{(autoValue||0).toLocaleString()} 円</span>
                        )}
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          )
        })}
        <div className="mb-6">
          {!showSectionInput ? (
            <button onClick={() => setShowSectionInput(true)}
              className="w-full border-2 border-dashed border-blue-300 text-blue-600 py-3 rounded-lg hover:bg-blue-50"
              title="工事区分を追加">+ 工事区分を追加</button>
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
      </div>
      {renderPopup()}
    </main>
  )

  // ==================== history画面 JSX ====================
  const renderHistory = () => (
    <main className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm px-2 py-1 flex items-center gap-1 flex-wrap">
        <span className="text-xs text-gray-400 font-mono mr-1">{VERSION}</span>
        <div className="relative">
          <button onClick={() => setShowTitleList(!showTitleList)}
            className="border border-blue-300 rounded px-2 py-0.5 text-xs bg-blue-50 hover:bg-blue-100 font-medium whitespace-nowrap"
            title="件名一覧">件名▼</button>
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
              {filteredEstimates.length === 0 && <div className="px-4 py-3 text-sm text-gray-400">該当なし</div>}
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
        {!is2Pane && (
          <button onClick={handleExportHistory}
            className="bg-green-600 text-white px-2 py-0.5 rounded text-xs hover:bg-green-700 whitespace-nowrap"
            title="Excel出力">Excel</button>
        )}
        <button onClick={handleNewEstimate}
          className="bg-teal-600 text-white px-2 py-0.5 rounded text-xs hover:bg-teal-700 whitespace-nowrap"
          title="新規で明細を作成">新規作成</button>
        {/* ② コピーボタン → 分岐モーダルへ */}
        <button onClick={handleCopyButtonClick} disabled={copying || !selectedEstimate || loading}
          className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap"
          title="コピー方法を選択して編集">
          {copying || loading ? '読込中...' : is2Pane ? '→編集' : 'コピー編集'}
        </button>
        <a href="/import"
          className="bg-purple-600 text-white px-2 py-0.5 rounded text-xs hover:bg-purple-700 whitespace-nowrap"
          title="Excelファイルを取り込む">取り込み</a>
        {!is2Pane && (
          <button onClick={() => setIs2Pane(true)} style={{
            backgroundColor: '#ffffff', color: '#2563eb',
            border: '1px solid #2563eb', borderRadius: '4px', padding: '2px 8px',
            fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap',
          }} title="2画面モード">2画面</button>
        )}
        <button onClick={resetFilters}
          className="ml-auto bg-orange-500 text-white px-3 py-0.5 rounded font-bold text-xs hover:bg-orange-600 whitespace-nowrap"
          title="フィルターリセット">←</button>
      </div>

      {selectedEstimate && (
        <div className="bg-blue-50 border-b px-4 py-1 text-xs text-gray-700 flex gap-4 flex-wrap">
          <span>{selectedEstimate.date}</span><span>{selectedEstimate.building}</span>
          <span className="font-medium">{selectedEstimate.title}</span>
          <span>{selectedEstimate.staff}</span><span>{selectedEstimate.work_type}</span>
        </div>
      )}

      <div className="p-4">
        {loading ? <div className="text-center py-8 text-gray-400">読み込み中...</div> : (
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
                        {Object.values(colWidths).map((w,i) => <col key={i} style={{width:w}} />)}
                      </colgroup>
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="p-1 text-center">No.</th><th className="p-1 text-left">名称</th>
                          <th className="p-1 text-left">仕様</th><th className="p-1 text-right">数量</th>
                          <th className="p-1 text-center">単位</th><th className="p-1 text-right">単価</th>
                          <th className="p-1 text-right">金額</th><th className="p-1 text-left">備考</th>
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
                    <span>{sectionName}　合計</span><span>{fmt(total)} 円</span>
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
  )

  // ==================== ① 2画面 or 通常レイアウト ====================
  const modals = <>{renderCopyModeModal()}{renderDraftListModal()}{renderApplyModal()}</>

  if (is2Pane) {
    return (
      <>
        <div className="flex h-screen overflow-hidden">
          <div className="w-1/2 overflow-y-auto border-r">{renderHistory()}</div>
          <div className="w-1/2 overflow-y-auto">
            {showEstimate && copyInfo ? renderEstimate() : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-2">
                <span className="text-4xl">→</span>
                <span>左の「→編集」ボタンを押すと</span>
                <span>ここにコピー編集が表示されます</span>
              </div>
            )}
          </div>
        </div>
        {modals}
      </>
    )
  }
  if (showEstimate && copyInfo) return <>{renderEstimate()}{modals}</>
  return <>{renderHistory()}{modals}</>
}
