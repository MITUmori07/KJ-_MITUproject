// ============================================================
// ディレクトリ: mitu-project/app/import/
// ファイル名: page.tsx
// バージョン: V1.0.0
// 更新: 2026/04/27
// 変更: 新規作成 Excelインポート画面
// ============================================================
'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

const VERSION = 'V1.0.0'

// 経費行・スキップ行の判定
const EXPENSE_NAMES = ['仮設工事費','運搬費','深夜作業割増','現場経費','小計']
const isExpenseRow = (name: string) =>
  EXPENSE_NAMES.some(e => (name || '').includes(e))
const isSectionTotal = (d: string) =>
  (d || '').includes('の計') || (d || '').includes('建築工事')
const isPageNum = (note: string) =>
  /^P\.\s*\d+/.test(note || '')
const isHeaderRow = (name: string) =>
  ['名　　　称', '（内訳）', 'Ⅰ', 'Ⅱ'].some(h => (name || '').startsWith(h))

// \n で分割して3段に
const split3 = (val: string | null | undefined): [string, string, string] => {
  const parts = (val || '').split('\n').map(s => s.trim()).filter(Boolean)
  return [parts[0] || '', parts[1] || '', parts[2] || '']
}

// ファイル名からメタ情報を取得
// 例: 20251112_新宿FT_32階サーバー室_大塚_C工事.xlsx
const parseFileName = (name: string) => {
  const base = name.replace(/\.xlsx?$/i, '')
  const parts = base.split('_')
  const rawDate = parts[0] || ''
  const date = rawDate.length === 8
    ? `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}`
    : ''
  const building = parts[1] || ''
  const staff = parts[parts.length - 2] || ''
  const workType = parts[parts.length - 1] || ''
  const title = parts.slice(2, parts.length - 2).join('_')
  return { date, building, title, staff, work_type: workType }
}

type PreviewRow = {
  rowNum: number
  work_section: string
  name1: string; name2: string; name3: string
  spec1: string; spec2: string; spec3: string
  quantity: string; unit: string; unit_price: string; amount: number
  note1: string; note2: string; note3: string
  warning: boolean
  warningMsg: string
}

type HeaderInfo = {
  date: string; building: string; title: string
  staff: string; work_type: string
}

export default function ImportPage() {
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [fileName, setFileName] = useState('')
  const [headerInfo, setHeaderInfo] = useState<HeaderInfo>({
    date: '', building: '', title: '', staff: '', work_type: ''
  })
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [importing, setImporting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [doneMsg, setDoneMsg] = useState('')

  const handleFile = async (file: File) => {
    setErrorMsg('')
    setFileName(file.name)
    const info = parseFileName(file.name)
    setHeaderInfo(info)

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellFormula: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

      const parsed: PreviewRow[] = []
      let currentSection = ''
      let rowOrder = 0

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const b = row[1]  // B列: 番号
        const c = String(row[2] || '').trim()  // C列: 名称
        const d = String(row[3] || '').trim()  // D列: 仕様
        const e = row[4]  // E列: 数量
        const f = String(row[5] || '').trim()  // F列: 単位
        const g = row[6]  // G列: 単価
        const h = row[7]  // H列: 金額
        const ii = String(row[8] || '').trim() // I列: 備考

        // ページ番号行スキップ
        if (isPageNum(ii) && !c) continue
        // ヘッダー行スキップ
        if (isHeaderRow(c)) continue
        // 合計行スキップ
        if (isSectionTotal(d)) continue
        // 空行スキップ
        if (!c && !d && !e && !g) continue

        // 工事区分ヘッダー（B列が数字でC列に名称、数量なし）
        if (typeof b === 'number' && c && !e && !g) {
          currentSection = c
          rowOrder = 0
          continue
        }

        // 経費行スキップ
        if (isExpenseRow(c)) continue

        // データ行
        if (c) {
          const [n1, n2, n3] = split3(c)
          const [s1, s2, s3] = split3(d)
          const [o1, o2, o3] = split3(ii)
          const qty = e !== null && e !== undefined ? Number(e) : null
          const price = g !== null && g !== undefined ? Number(g) : null
          const amount = qty !== null && price !== null ? Math.round(qty * price) : 0

          const warning = !currentSection || qty === null || price === null
          const msgs: string[] = []
          if (!currentSection) msgs.push('工事区分不明')
          if (qty === null) msgs.push('数量なし')
          if (price === null) msgs.push('単価なし')

          rowOrder++
          parsed.push({
            rowNum: i + 1,
            work_section: currentSection || '不明',
            name1: n1, name2: n2, name3: n3,
            spec1: s1, spec2: s2, spec3: s3,
            quantity: qty !== null ? String(qty) : '',
            unit: f,
            unit_price: price !== null ? String(price) : '',
            amount,
            note1: o1, note2: o2, note3: o3,
            warning,
            warningMsg: msgs.join('・'),
          })
        }
      }

      if (parsed.length === 0) {
        setErrorMsg('明細データが見つかりませんでした。Excelの形式を確認してください。')
        return
      }

      setPreviewRows(parsed)
      setStep('preview')
    } catch (e) {
      setErrorMsg('ファイルの読み込みに失敗しました。Excelファイルを確認してください。')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const updateRow = (idx: number, field: keyof PreviewRow, value: string) => {
    setPreviewRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const updated = { ...r, [field]: value }
      const q = parseFloat(updated.quantity) || 0
      const p = parseFloat(updated.unit_price) || 0
      updated.amount = Math.round(q * p)
      updated.warning = !updated.work_section || !updated.quantity || !updated.unit_price
      return updated
    }))
  }

  const deleteRow = (idx: number) => {
    setPreviewRows(prev => prev.filter((_, i) => i !== idx))
  }

  const handleImport = async () => {
    setErrorMsg('')
    if (!headerInfo.date) { setErrorMsg('日付を入力してください'); return }
    if (!headerInfo.title) { setErrorMsg('件名を入力してください'); return }
    if (previewRows.length === 0) { setErrorMsg('明細データがありません'); return }

    setImporting(true)

    try {
      // estimates INSERT
      const { data: estData, error: estError } = await supabase
        .from('estimates')
        .insert({
          date: headerInfo.date,
          building: headerInfo.building,
          title: headerInfo.title,
          staff: headerInfo.staff,
          work_type: headerInfo.work_type,
        })
        .select('id')
        .single()

      if (estError || !estData) {
        setErrorMsg('見積ヘッダーの保存に失敗しました: ' + (estError?.message || ''))
        setImporting(false)
        return
      }

      const estimateId = estData.id

      // estimate_items INSERT
      const itemsToInsert = previewRows.map((r, idx) => ({
        estimate_id: estimateId,
        work_section: r.work_section,
        row_order: idx + 1,
        name1: r.name1, name2: r.name2 || null, name3: r.name3 || null,
        spec1: r.spec1 || null, spec2: r.spec2 || null, spec3: r.spec3 || null,
        quantity: parseFloat(r.quantity) || 0,
        unit: r.unit || '',
        unit_price: parseFloat(r.unit_price) || 0,
        amount: r.amount,
        note1: r.note1 || null, note2: r.note2 || null, note3: r.note3 || null,
        is_matched: false,
      }))

      const { error: itemsError } = await supabase
        .from('estimate_items')
        .insert(itemsToInsert)

      if (itemsError) {
        // estimatesをロールバック
        await supabase.from('estimates').delete().eq('id', estimateId)
        setErrorMsg('明細データの保存に失敗しました: ' + itemsError.message)
        setImporting(false)
        return
      }

      setDoneMsg(`取り込み完了！ ${previewRows.length}行を登録しました。`)
      setStep('done')
    } catch (e) {
      setErrorMsg('予期しないエラーが発生しました')
    }
    setImporting(false)
  }

  const warningCount = previewRows.filter(r => r.warning).length
  const sections = [...new Set(previewRows.map(r => r.work_section))]

  // ==================== STEP: upload ====================
  if (step === 'upload') return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <a href="/history" className="text-blue-600 hover:text-blue-800 text-sm">← history</a>
          <span className="text-gray-400">/</span>
          <span className="text-sm font-bold text-gray-700">Excelインポート</span>
          <span className="ml-auto text-xs text-gray-400">{VERSION}</span>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h1 className="text-lg font-bold text-gray-800 mb-4">Excelファイルを取り込む</h1>

          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed border-blue-300 rounded-xl p-10 text-center hover:bg-blue-50 transition-colors cursor-pointer"
            onClick={() => document.getElementById('fileInput')?.click()}>
            <div className="text-4xl mb-3">📂</div>
            <div className="text-sm text-gray-600 mb-1">ここにExcelファイルをドラッグ＆ドロップ</div>
            <div className="text-xs text-gray-400">または クリックして選択</div>
            <input id="fileInput" type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>

          {errorMsg && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              ⚠️ {errorMsg}
            </div>
          )}

          <div className="mt-4 text-xs text-gray-400">
            <div>ファイル名の形式: YYYYMMDD_ビル名_件名_担当者_工事種別.xlsx</div>
            <div className="mt-1">例: 20251112_新宿FT_32階天井工事_大塚_C工事.xlsx</div>
          </div>
        </div>
      </div>
    </main>
  )

  // ==================== STEP: preview ====================
  if (step === 'preview') return (
    <main className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm px-4 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { setStep('upload'); setPreviewRows([]) }}
            className="bg-gray-500 text-white px-3 py-1 rounded text-xs"
            title="アップロード画面に戻る">← 戻る</button>
          <span className="text-sm font-bold text-gray-700">プレビュー確認</span>
          <span className="text-xs text-gray-500">{fileName}</span>
          {warningCount > 0 && (
            <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded">
              ⚠️ {warningCount}行 要確認
            </span>
          )}
          <div className="ml-auto flex gap-2 items-center">
            <span className="text-xs text-gray-500">{previewRows.length}行</span>
            <button onClick={handleImport} disabled={importing}
              className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
              title="SupabaseにINSERTする">
              {importing ? '取り込み中...' : '取り込む'}
            </button>
          </div>
        </div>

        {/* ヘッダー情報 */}
        <div className="flex flex-wrap gap-2 mt-2 pb-1">
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-400">日付<span className="text-red-400">*</span></label>
            <input type="date" className="border rounded px-2 py-0.5 text-xs w-32"
              value={headerInfo.date}
              onChange={e => setHeaderInfo({...headerInfo, date: e.target.value})} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-400">ビル名</label>
            <select className="border rounded px-1 py-0.5 text-xs w-24"
              value={headerInfo.building}
              onChange={e => setHeaderInfo({...headerInfo, building: e.target.value})}>
              {['新宿FT','新宿ESS'].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-0.5 flex-1 min-w-[160px]">
            <label className="text-xs text-gray-400">件名<span className="text-red-400">*</span></label>
            <input type="text" className="border rounded px-2 py-0.5 text-xs w-full"
              value={headerInfo.title}
              onChange={e => setHeaderInfo({...headerInfo, title: e.target.value})} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-400">担当者</label>
            <input type="text" className="border rounded px-2 py-0.5 text-xs w-16"
              value={headerInfo.staff}
              onChange={e => setHeaderInfo({...headerInfo, staff: e.target.value})} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-400">種別</label>
            <select className="border rounded px-1 py-0.5 text-xs w-20"
              value={headerInfo.work_type}
              onChange={e => setHeaderInfo({...headerInfo, work_type: e.target.value})}>
              {['A工事','B工事','C工事'].map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-1 bg-red-50 border border-red-200 rounded px-3 py-1 text-xs text-red-700">
            ⚠️ {errorMsg}
          </div>
        )}
      </div>

      {/* 明細プレビュー */}
      <div className="p-4 max-w-6xl mx-auto">
        {sections.map(section => {
          const sectionRows = previewRows.filter(r => r.work_section === section)
          const sectionTotal = sectionRows.reduce((sum, r) => sum + r.amount, 0)
          return (
            <div key={section} className="mb-6">
              <div className="bg-blue-800 text-white px-4 py-2 rounded-t flex justify-between">
                <span className="font-bold text-sm">{section}</span>
                <span className="text-xs">小計 {sectionTotal.toLocaleString()} 円</span>
              </div>
              <div className="bg-white border border-t-0 rounded-b overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-1 w-8">行</th>
                      <th className="p-1 text-left w-40">名称</th>
                      <th className="p-1 text-left w-36">仕様</th>
                      <th className="p-1 text-right w-16">数量</th>
                      <th className="p-1 text-left w-12">単位</th>
                      <th className="p-1 text-right w-20">単価</th>
                      <th className="p-1 text-right w-20">金額</th>
                      <th className="p-1 text-left w-24">備考</th>
                      <th className="p-1 w-8">削除</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionRows.map(row => {
                      const idx = previewRows.indexOf(row)
                      return (
                        <tr key={idx} className={`border-t ${row.warning ? 'bg-yellow-50' : ''}`}>
                          <td className="p-1 text-center text-gray-400">
                            {row.warning
                              ? <span title={row.warningMsg} className="text-yellow-600 cursor-help">⚠️</span>
                              : <span className="text-gray-300">{row.rowNum}</span>
                            }
                          </td>
                          <td className="p-1">
                            <input className="w-full border rounded px-1 py-0.5 mb-0.5 text-xs" value={row.name1}
                              onChange={e => updateRow(idx, 'name1', e.target.value)} />
                            {(row.name2 || row.name3) && <>
                              <input className="w-full border rounded px-1 py-0.5 mb-0.5 text-xs text-gray-500" value={row.name2}
                                onChange={e => updateRow(idx, 'name2', e.target.value)} />
                              <input className="w-full border rounded px-1 py-0.5 text-xs text-gray-500" value={row.name3}
                                onChange={e => updateRow(idx, 'name3', e.target.value)} />
                            </>}
                          </td>
                          <td className="p-1">
                            <input className="w-full border rounded px-1 py-0.5 mb-0.5 text-xs" value={row.spec1}
                              onChange={e => updateRow(idx, 'spec1', e.target.value)} />
                            {(row.spec2 || row.spec3) && <>
                              <input className="w-full border rounded px-1 py-0.5 mb-0.5 text-xs text-gray-500" value={row.spec2}
                                onChange={e => updateRow(idx, 'spec2', e.target.value)} />
                              <input className="w-full border rounded px-1 py-0.5 text-xs text-gray-500" value={row.spec3}
                                onChange={e => updateRow(idx, 'spec3', e.target.value)} />
                            </>}
                          </td>
                          <td className="p-1">
                            <input className="w-full border rounded px-1 py-0.5 text-xs text-right" value={row.quantity}
                              type="number" onChange={e => updateRow(idx, 'quantity', e.target.value)} />
                          </td>
                          <td className="p-1">
                            <input className="w-full border rounded px-1 py-0.5 text-xs" value={row.unit}
                              onChange={e => updateRow(idx, 'unit', e.target.value)} />
                          </td>
                          <td className="p-1">
                            <input className="w-full border rounded px-1 py-0.5 text-xs text-right" value={row.unit_price}
                              type="number" onChange={e => updateRow(idx, 'unit_price', e.target.value)} />
                          </td>
                          <td className="p-1 text-right pr-2">{row.amount.toLocaleString()}</td>
                          <td className="p-1">
                            <input className="w-full border rounded px-1 py-0.5 text-xs" value={row.note1}
                              onChange={e => updateRow(idx, 'note1', e.target.value)} />
                          </td>
                          <td className="p-1 text-center">
                            <button onClick={() => deleteRow(idx)}
                              className="text-red-400 hover:text-red-600 text-xs"
                              title="この行を削除">✕</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )

  // ==================== STEP: done ====================
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow p-8 text-center max-w-sm w-full">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-lg font-bold text-gray-800 mb-2">取り込み完了</h2>
        <p className="text-sm text-gray-600 mb-6">{doneMsg}</p>
        <div className="flex flex-col gap-3">
          <button onClick={() => { setStep('upload'); setPreviewRows([]); setFileName(''); setDoneMsg('') }}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-blue-700">
            続けて取り込む
          </button>
          <a href="/history"
            className="border border-gray-300 text-gray-600 px-4 py-2 rounded text-sm text-center hover:bg-gray-50">
            historyに戻る
          </a>
        </div>
      </div>
    </main>
  )
}
