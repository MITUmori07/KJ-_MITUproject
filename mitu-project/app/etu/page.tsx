// ============================================================
// ディレクトリ: mitu-project/app/etu/
// ファイル名: page.tsx
// バージョン: V1.0.2
// 更新: 2026/04/29
// 変更: V1.0.2 閲覧専用クリーン版で作り直し
// 変更: V1.0.2 閲覧専用クリーン版で作り直し
// ============================================================
'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const VERSION = 'V1.0.2'

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
type Filters = { staff: string; building: string; workType: string; year: string }

const t = (str: string|null|undefined, len: number) => (str || '').slice(0, len)

export default function EtuPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate|null>(null)
  const [items, setItems] = useState<EstimateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [showTitleList, setShowTitleList] = useState(false)
  const [filters, setFilters] = useState<Filters>({ staff:'', building:'', workType:'', year:'' })
  const [rowHeight, setRowHeight] = useState<'small'|'large'>('large')
  const [highlightedItems, setHighlightedItems] = useState<Set<number>>(new Set())

  const toggleHighlight = (id: number) => {
    setHighlightedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => { loadEstimates() }, [])

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

  const SECTION_ORDER = ['解体工事','内装工事','外部仕上工事','塗装工事','植栽工事','躯体工事']
  const normalItems = items.filter(i => !i.work_section.startsWith('経費_'))
  const sectionNames = [...new Set(normalItems.map(i => i.work_section))].sort((a, b) => {
    const aIsLast = a.startsWith('特殊仮設工事')
    const bIsLast = b.startsWith('特殊仮設工事')
    if (aIsLast && !bIsLast) return 1
    if (!aIsLast && bIsLast) return -1
    const ai = SECTION_ORDER.indexOf(a), bi = SECTION_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1; if (bi === -1) return -1; return ai - bi
  })

  const fmt = (n: number) => Math.round(n).toLocaleString()

  const getSectionData = (sectionName: string) => {
    const sectionItems = normalItems.filter(i => i.work_section === sectionName)
    const expenses = items.filter(i => i.work_section === `経費_${sectionName}`)
    const subtotalVal = sectionItems.reduce((sum, i) => sum + (i.amount||0), 0)
    const expTotal = expenses.filter(e => e.name1 !== '小計').reduce((sum, i) => sum + (i.amount||0), 0)
    return { sectionItems, expenses, subtotal: subtotalVal, total: Math.floor((subtotalVal + expTotal) / 100) * 100 }
  }

  const historyGrandTotal = sectionNames.reduce((sum, name) => sum + getSectionData(name).total, 0)

  const handleExport = async () => {
    if (!selectedEstimate) return
    const exportSections = sectionNames.map(name => {
      const { sectionItems, expenses, subtotal: sub } = getSectionData(name)
      const expenseRows = expenses.filter(e => e.name1 !== '小計')
      const getExpenseAmount = (expName: string, altName?: string) => {
        const exp = expenseRows.find(e => e.name1 === expName || (altName && e.name1 === altName))
        return exp ? (exp.amount || 0) : 0
      }
      const keihi = getExpenseAmount('仮設工事費')
      const unban = getExpenseAmount('運搬費')
      const night = getExpenseAmount('深夜作業割増', '深夜休日作業割増')
      const genba = getExpenseAmount('現場経費', '現場雑費')
      const zeinuki = sub + keihi + unban + night
      const sectionTotal = Math.floor(zeinuki * 1.10 / 100) * 100
      const genbaCalc = sectionTotal - zeinuki
      return {
        id: name, name,
        rows: sectionItems.map(item => ({
          id: String(item.id), name1: item.name1||'', name2: item.name2||'', name3: item.name3||'',
          spec1: item.spec1||'', spec2: item.spec2||'', spec3: item.spec3||'',
          quantity: String(item.quantity), unit: item.unit||'',
          unit_price: String(item.unit_price), amount: item.amount,
          note1: item.note1||'', note2: item.note2||'', note3: item.note3||'',
          candidates: [], showCandidates: false,
        })),
        keihi, unban, night,
        genba: genba > 0 ? genba : genbaCalc,
        sectionTotal: genba > 0 ? sub + keihi + unban + night + genba : sectionTotal,
      }
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

  const colWidths = { no:'3%', name:'25%', spec:'22%', qty:'6%', unit:'4%', price:'10%', amount:'11%', note:'15%', hl:'4%' }

  return (
    <main className="min-h-screen bg-gray-50">
      <div style={{maxWidth:'880px', margin:'0 auto'}}>
        <div className="sticky top-0 z-20 bg-white border-b shadow-sm px-2 py-1 flex items-center gap-1 flex-wrap">
          <span className="text-xs text-gray-400 font-mono mr-1">{VERSION}</span>
          <div className="relative">
            <button onClick={() => setShowTitleList(!showTitleList)}
              className="border border-blue-300 rounded px-2 py-0.5 text-xs bg-blue-50 hover:bg-blue-100 font-medium whitespace-nowrap">
              件名▼</button>
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
          <button onClick={handleExport}
            className="bg-green-600 text-white px-2 py-0.5 rounded text-xs hover:bg-green-700 whitespace-nowrap">Excel</button>
          <button onClick={() => setRowHeight(h => h === 'small' ? 'large' : 'small')}
            className="border border-gray-400 rounded px-2 py-0.5 text-xs bg-white hover:bg-gray-100 font-bold whitespace-nowrap">
            {rowHeight === 'large' ? '小' : '大'}
          </button>
          <button onClick={resetFilters}
            className="ml-auto bg-orange-500 text-white px-3 py-0.5 rounded font-bold text-xs hover:bg-orange-600 whitespace-nowrap">←</button>
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
                const { sectionItems, expenses, total } = getSectionData(sectionName)
                return (
                  <div key={sectionName} className="mb-6">
                    <div className="bg-blue-800 text-white px-4 py-5 flex justify-between items-center">
                      <span className="font-bold text-sm">{sectionName}</span>
                      <span className="text-xs">工事合計 {fmt(total)} 円</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full bg-white border border-t-0" style={{tableLayout:'fixed', fontSize:'11px'}}>
                        <colgroup>
                          {Object.values(colWidths).map((w,i) => <col key={i} style={{width:w}} />)}
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
                            <th className="p-1 text-center"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectionItems.map((item, itemIdx) => {
                            const isHL = highlightedItems.has(item.id)
                            const tdPy = rowHeight === 'large' ? 'py-8' : 'py-1'
                            return (
                              <tr key={item.id} className={`border-t align-top ${isHL ? 'bg-yellow-100' : ''}`}>
                                <td className={`${tdPy} text-center`}>{itemIdx + 1}</td>
                                <td className={`${tdPy} overflow-hidden`}>
                                  {item.name1 && <div className="truncate" style={{fontSize:'12px'}}>{t(item.name1,12)}</div>}
                                  {item.name2 && <div className="truncate text-gray-500" style={{fontSize:'12px'}}>{t(item.name2,12)}</div>}
                                  {item.name3 && <div className="truncate text-gray-500" style={{fontSize:'12px'}}>{t(item.name3,12)}</div>}
                                </td>
                                <td className={`${tdPy} overflow-hidden`}>
                                  {item.spec1 && <div className="truncate" style={{fontSize:'11px'}}>{t(item.spec1,16)}</div>}
                                  {item.spec2 && <div className="truncate text-gray-500" style={{fontSize:'11px'}}>{t(item.spec2,16)}</div>}
                                  {item.spec3 && <div className="truncate text-gray-500" style={{fontSize:'11px'}}>{t(item.spec3,16)}</div>}
                                </td>
                                <td className={`${tdPy} text-right`}>{item.quantity?.toFixed(1)}</td>
                                <td className={`${tdPy} text-center`}>{t(item.unit,2)}</td>
                                <td className={`${tdPy} text-right`}>{fmt(item.unit_price)}</td>
                                <td className={`${tdPy} text-right`}>{fmt(item.amount)}</td>
                                <td className={`${tdPy} overflow-hidden`}>
                                  {item.note1 && <div className="truncate" style={{fontSize:'11px'}}>{t(item.note1,7)}</div>}
                                  {item.note2 && <div className="truncate text-gray-500" style={{fontSize:'11px'}}>{t(item.note2,7)}</div>}
                                  {item.note3 && <div className="truncate text-gray-500" style={{fontSize:'11px'}}>{t(item.note3,7)}</div>}
                                </td>
                                <td className={`${tdPy} text-center`}>
                                  <button onClick={() => toggleHighlight(item.id)}
                                    className={`w-5 h-5 rounded text-xs leading-none ${isHL ? 'bg-yellow-400 hover:bg-yellow-500' : 'bg-gray-100 hover:bg-yellow-200'}`}>●</button>
                                </td>
                              </tr>
                            )
                          })}
                          {(() => {
                            const expDefs = [
                              { key: '小計' },
                              { key: '仮設工事費' },
                              { key: '運搬費' },
                              { key: '深夜作業割増', alt: '深夜休日作業割増' },
                              { key: '現場経費', alt: '現場雑費' },
                            ]
                            const normalizedExp = expDefs.map(({ key, alt }) =>
                              expenses.find(e => e.name1 === key || (alt && e.name1 === alt)) ||
                              { id: key, name1: key, amount: 0, quantity: 0, unit: '', spec1: null, note1: null }
                            )
                            return normalizedExp.map(exp => (
                              <tr key={exp.id} className="border-t bg-gray-50 align-top">
                                <td className="py-3"></td>
                                <td className="py-3 text-gray-600 truncate" style={{fontSize:'12px'}}>{t(exp.name1,12)}</td>
                                <td className="py-3 text-gray-600 truncate" style={{fontSize:'11px'}}>{t(exp.spec1,16)}</td>
                                <td className="py-3 text-right text-gray-600">{exp.quantity > 0 ? exp.quantity?.toFixed(1) : ''}</td>
                                <td className="py-3 text-center text-gray-600">{t(exp.unit,2)}</td>
                                <td className="py-3 text-right text-gray-600"></td>
                                <td className="py-3 text-right text-gray-600">{fmt(exp.amount)}</td>
                                <td className="py-3 text-gray-600 truncate" style={{fontSize:'11px'}}>{t(exp.note1,7)}</td>
                                <td className="py-3"></td>
                              </tr>
                            ))
                          })()}
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
      </div>
    </main>
  )
}
