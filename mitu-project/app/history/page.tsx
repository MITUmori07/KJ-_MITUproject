'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

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
  building: string
  workType: string
  staff: string
  title: string
}

export default function HistoryPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null)
  const [items, setItems] = useState<EstimateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<Filters>({
    building: '', workType: '', staff: '', title: ''
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

  const handleFilterChange = (newFilter: Partial<Filters>) => {
    const updated = { ...filters, ...newFilter }
    setFilters(updated)
    const matched = estimates.filter(e => {
      if (updated.building && e.building !== updated.building) return false
      if (updated.workType && e.work_type !== updated.workType) return false
      if (updated.staff && e.staff !== updated.staff) return false
      if (updated.title && e.title !== updated.title) return false
      return true
    })
    if (matched.length > 0) loadItems(matched[0])
  }

  const resetFilters = () => {
    setFilters({ building: '', workType: '', staff: '', title: '' })
    // 明細はそのまま維持
  }

  // 他のフィルター条件で絞り込んだ選択肢を返す
  const getOptions = (exclude: keyof Filters) => estimates.filter(e => {
    if (exclude !== 'building' && filters.building && e.building !== filters.building) return false
    if (exclude !== 'workType' && filters.workType && e.work_type !== filters.workType) return false
    if (exclude !== 'staff' && filters.staff && e.staff !== filters.staff) return false
    if (exclude !== 'title' && filters.title && e.title !== filters.title) return false
    return true
  })

  const buildings = [...new Set(getOptions('building').map(e => e.building))]
  const workTypes = [...new Set(getOptions('workType').map(e => e.work_type))]
  const staffList = [...new Set(getOptions('staff').map(e => e.staff))]
  const titles = [...new Set(getOptions('title').map(e => e.title))]

  // 経費行を除いた通常明細
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
        id: name,
        name,
        rows: sectionItems.map(item => ({
          id: String(item.id),
          name1: item.name1 || '',
          name2: item.name2 || '',
          name3: item.name3 || '',
          spec1: item.spec1 || '',
          spec2: item.spec2 || '',
          spec3: item.spec3 || '',
          quantity: String(item.quantity),
          unit: item.unit || '',
          unit_price: String(item.unit_price),
          amount: item.amount,
          note1: item.note1 || '',
          note2: item.note2 || '',
          note3: item.note3 || '',
          candidates: [],
          showCandidates: false,
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

  return (
    <main className="min-h-screen bg-gray-50">

      {/* 上部固定フィルターバー */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-2 flex items-center gap-2 flex-wrap">
        <select
          className="border rounded px-2 py-1 text-sm"
          value={filters.building}
          onChange={e => handleFilterChange({ building: e.target.value })}>
          <option value="">ビル名▼</option>
          {buildings.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={filters.workType}
          onChange={e => handleFilterChange({ workType: e.target.value })}>
          <option value="">工事種別▼</option>
          {workTypes.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={filters.staff}
          onChange={e => handleFilterChange({ staff: e.target.value })}>
          <option value="">担当者▼</option>
          {staffList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={filters.title}
          onChange={e => handleFilterChange({ title: e.target.value })}>
          <option value="">件名▼</option>
          {titles.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button
          onClick={handleExport}
          className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 ml-2">
          Excelダウンロード
        </button>
        <button
          onClick={resetFilters}
          className="ml-auto border rounded px-4 py-1 text-sm font-bold hover:bg-gray-100">
          ←
        </button>
      </div>

      {/* 案件情報バー */}
      {selectedEstimate && (
        <div className="bg-blue-50 border-b px-4 py-2 text-sm text-gray-700 flex gap-4 flex-wrap">
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
                    <span className="font-bold">{sectionName}</span>
                    <span className="text-sm">小計 {fmt(subtotal)} 円</span>
                  </div>

                  {/* 明細テーブル */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs bg-white border border-t-0">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="p-2 text-center" style={{width:'4%'}}>No.</th>
                          <th className="p-2 text-left" style={{width:'22%'}}>名称</th>
                          <th className="p-2 text-left" style={{width:'20%'}}>仕様</th>
                          <th className="p-2 text-right" style={{width:'7%'}}>数量</th>
                          <th className="p-2 text-center" style={{width:'5%'}}>単位</th>
                          <th className="p-2 text-right" style={{width:'10%'}}>単価</th>
                          <th className="p-2 text-right" style={{width:'12%'}}>金額</th>
                          <th className="p-2 text-left" style={{width:'20%'}}>備考</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionItems.map(item => (
                          <tr key={item.id} className="border-t align-top">
                            <td className="p-2 text-center">{item.row_order}</td>
                            <td className="p-2">
                              {item.name1 && <div>{item.name1}</div>}
                              {item.name2 && <div className="text-gray-500">{item.name2}</div>}
                              {item.name3 && <div className="text-gray-500">{item.name3}</div>}
                            </td>
                            <td className="p-2">
                              {item.spec1 && <div>{item.spec1}</div>}
                              {item.spec2 && <div className="text-gray-500">{item.spec2}</div>}
                              {item.spec3 && <div className="text-gray-500">{item.spec3}</div>}
                            </td>
                            <td className="p-2 text-right">{item.quantity?.toFixed(1)}</td>
                            <td className="p-2 text-center">{item.unit}</td>
                            <td className="p-2 text-right">{fmt(item.unit_price)}</td>
                            <td className="p-2 text-right">{fmt(item.amount)}</td>
                            <td className="p-2">
                              {item.note1 && <div>{item.note1}</div>}
                              {item.note2 && <div className="text-gray-500">{item.note2}</div>}
                              {item.note3 && <div className="text-gray-500">{item.note3}</div>}
                            </td>
                          </tr>
                        ))}

                        {/* 経費行（グレー背景）*/}
                        {expenses.map(exp => (
                          <tr key={exp.id} className="border-t bg-gray-50 align-top">
                            <td className="p-2"></td>
                            <td className="p-2 text-gray-600">{exp.name1}</td>
                            <td className="p-2 text-gray-600">{exp.spec1}</td>
                            <td className="p-2 text-right text-gray-600">{exp.quantity?.toFixed(1)}</td>
                            <td className="p-2 text-center text-gray-600">{exp.unit}</td>
                            <td className="p-2 text-right text-gray-600">{fmt(exp.unit_price)}</td>
                            <td className="p-2 text-right text-gray-600">{fmt(exp.amount)}</td>
                            <td className="p-2 text-gray-600">{exp.note1}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 工事区分合計（100単位切り捨て）*/}
                  <div className="bg-gray-200 border border-t-0 px-4 py-2 flex justify-between font-bold text-sm">
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
  )
}
