'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const VERSION = 'v0.3.2'

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

type Filters = {
  staff: string
  building: string
  workType: string
  year: string
}

const t = (str: string | null | undefined, len: number) => (str || '').slice(0, len)

export default function HistoryPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null)
  const [items, setItems] = useState<EstimateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [showTitleList, setShowTitleList] = useState(false)
  const [is880, setIs880] = useState(false)
  const [filters, setFilters] = useState<Filters>({
    staff: '', building: '', workType: '', year: ''
  })

  useEffect(() => {
    loadEstimates()
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

  const normalItems = items.filter(i => !i.work_section.startsWith('経費_'))
  const sectionNames = [...new Set(normalItems.map(i => i.work_section))]

  const fmt = (n: number) => Math.round(n).toLocaleString()

  const getSectionData = (sectionName: string) => {
    const sectionItems = normalItems.filter(i => i.work_section === sectionName)
    const expenses = items.filter(i => i.work_section === `経費_${sectionName}`)
    const subtotal = sectionItems.reduce((sum, i) => sum + (i.amount || 0), 0)
    const expTotal = expenses.reduce((sum, i) => sum + (i.amount || 0), 0)
    const total = Math.floor((subtotal + expTotal) / 100) * 100
    return { sectionItems, expenses, subtotal, total }
  }

  const grandTotal = sectionNames.reduce((sum, name) => sum + getSectionData(name).total, 0)

  const handleExport = async () => {
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

  // 列幅定義（合計100%）
  const colWidths = {
    no:     '3%',
    name:   '26%',
    spec:   '24%',
    qty:    '6%',
    unit:   '4%',
    price:  '10%',
    amount: '11%',
    note:   '16%',
  }

  return (
    // style属性で幅を直接指定（Tailwind動的クラス問題を回避）
    <div style={is880 ? { maxWidth: '880px', margin: '0 auto' } : {}}>
      <main className="min-h-screen bg-gray-50">

        {/* 上部固定フィルターバー */}
        <div className="sticky top-0 z-20 bg-white border-b shadow-sm px-2 py-1 flex items-center gap-1">

          {/* バージョン */}
          <span className="text-xs text-gray-400 font-mono mr-1">{VERSION}</span>

          {/* 件名▼ */}
          <div className="relative">
            <button
              onClick={() => setShowTitleList(!showTitleList)}
              className="border border-blue-300 rounded px-2 py-0.5 text-xs bg-blue-50 hover:bg-blue-100 font-medium whitespace-nowrap">
              件名▼
            </button>
            {showTitleList && (
              <div className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg z-30 min-w-[300px] max-h-[60vh] overflow-y-auto">
                {filteredEstimates.map((e, i) => (
                  <div key={e.id}>
                    <div
                      onClick={() => handleTitleSelect(e)}
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

          {/* 担当者▼ */}
          <select className="border rounded px-1 py-0.5 text-xs w-20"
            value={filters.staff}
            onChange={e => setFilters({ ...filters, staff: e.target.value })}>
            <option value="">担当者▼</option>
            {staffList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* ビル名▼ */}
          <select className="border rounded px-1 py-0.5 text-xs w-24"
            value={filters.building}
            onChange={e => setFilters({ ...filters, building: e.target.value })}>
            <option value="">ビル名▼</option>
            {buildings.map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          {/* 工事種別▼ */}
          <select className="border rounded px-1 py-0.5 text-xs w-20"
            value={filters.workType}
            onChange={e => setFilters({ ...filters, workType: e.target.value })}>
            <option value="">種別▼</option>
            {workTypes.map(w => <option key={w} value={w}>{w}</option>)}
          </select>

          {/* 年▼ */}
          <select className="border rounded px-1 py-0.5 text-xs w-16"
            value={filters.year}
            onChange={e => setFilters({ ...filters, year: e.target.value })}>
            <option value="">年▼</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Excel */}
          <button onClick={handleExport}
            className="bg-green-600 text-white px-2 py-0.5 rounded text-xs hover:bg-green-700 whitespace-nowrap">
            Excel
          </button>

          {/* 880トグル */}
          <button
            onClick={() => setIs880(!is880)}
            style={{
              backgroundColor: is880 ? '#2563eb' : '#ffffff',
              color: is880 ? '#ffffff' : '#2563eb',
              border: '1px solid #2563eb',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}>
            880
          </button>

          {/* ← リセット */}
          <button onClick={resetFilters}
            className="ml-auto bg-orange-500 text-white px-3 py-0.5 rounded text-xs font-bold hover:bg-orange-600 whitespace-nowrap">
            ←
          </button>
        </div>

        {/* 案件情報バー */}
        {selectedEstimate && (
          <div className="bg-blue-50 border-b px-4 py-1 text-xs text-gray-700 flex gap-4 flex-wrap">
            <span>{selectedEstimate.date}</span>
            <span>{selectedEstimate.building}</span>
            <span className="font-medium">{selectedEstimate.title}</span>
            <span>{selectedEstimate.staff}</span>
            <span>{selectedEstimate.work_type}</span>
          </div>
        )}

        {/* 明細エリア */}
        <div className="p-4">
          {loading ? (
            <div className="text-center py-8 text-gray-400">読み込み中...</div>
          ) : (
            <>
              {sectionNames.map(sectionName => {
                const { sectionItems, expenses, subtotal, total } = getSectionData(sectionName)
                return (
                  <div key={sectionName} className="mb-6">

                    {/* 工事区分ヘッダー（青帯）*/}
                    <div className="bg-blue-800 text-white px-4 py-2 flex justify-between items-center">
                      <span className="font-bold text-sm">{sectionName}</span>
                      <span className="text-xs">小計 {fmt(subtotal)} 円</span>
                    </div>

                    {/* 明細テーブル */}
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
                              {/* 名称: 12文字・10pt相当 */}
                              <td className="p-1 overflow-hidden">
                                {item.name1 && <div className="truncate" style={{fontSize:'11px'}}>{t(item.name1,12)}</div>}
                                {item.name2 && <div className="truncate text-gray-500" style={{fontSize:'11px'}}>{t(item.name2,12)}</div>}
                                {item.name3 && <div className="truncate text-gray-500" style={{fontSize:'11px'}}>{t(item.name3,12)}</div>}
                              </td>
                              {/* 仕様: 16文字・9pt相当 */}
                              <td className="p-1 overflow-hidden">
                                {item.spec1 && <div className="truncate" style={{fontSize:'10px'}}>{t(item.spec1,16)}</div>}
                                {item.spec2 && <div className="truncate text-gray-500" style={{fontSize:'10px'}}>{t(item.spec2,16)}</div>}
                                {item.spec3 && <div className="truncate text-gray-500" style={{fontSize:'10px'}}>{t(item.spec3,16)}</div>}
                              </td>
                              <td className="p-1 text-right">{item.quantity?.toFixed(1)}</td>
                              <td className="p-1 text-center">{t(item.unit,2)}</td>
                              <td className="p-1 text-right">{fmt(item.unit_price)}</td>
                              <td className="p-1 text-right">{fmt(item.amount)}</td>
                              {/* 備考: 7文字・幅狭め */}
                              <td className="p-1 overflow-hidden">
                                {item.note1 && <div className="truncate" style={{fontSize:'10px'}}>{t(item.note1,7)}</div>}
                                {item.note2 && <div className="truncate text-gray-500" style={{fontSize:'10px'}}>{t(item.note2,7)}</div>}
                                {item.note3 && <div className="truncate text-gray-500" style={{fontSize:'10px'}}>{t(item.note3,7)}</div>}
                              </td>
                            </tr>
                          ))}

                          {/* 経費行 */}
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

                    {/* 工事区分合計 */}
                    <div className="bg-gray-200 border border-t-0 px-4 py-1.5 flex justify-between font-bold text-sm">
                      <span>{sectionName}　合計</span>
                      <span>{fmt(total)} 円</span>
                    </div>
                  </div>
                )
              })}

              {/* 建築工事の計 */}
              {sectionNames.length > 0 && (
                <div className="bg-blue-900 text-white px-6 py-4 rounded flex justify-between items-center mt-4 mb-8">
                  <span className="text-lg font-bold">建築工事の計</span>
                  <span className="text-xl font-bold">{fmt(grandTotal)} 円</span>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
