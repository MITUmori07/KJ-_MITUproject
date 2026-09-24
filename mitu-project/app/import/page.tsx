// ============================================================
// ディレクトリ: mitu-project/app/import/
// ファイル名: page.tsx
// バージョン: V1.4.0
// 更新: 2026/09/08
// 変更: V1.2.0 feat: buildingsテーブル動的取得・新規ビル名自動追加
// 変更: V1.3.0 feat: 「元の見積」を選んで紐づけられるようにした。
//                    選ぶとそのグループの次の版として保存され、履歴の版ボタンで行き来できる。
//                    過去の版はそのまま残す（しまうのは履歴画面での長押しのみ）。
//                    ファイル名の件名から候補を自動選択する。選ばなければ従来どおり新規登録。
// 変更: V1.4.0 fix: 読み取りルールを lib/importExcel.ts に分離し、次の形の見積書も読めるようにした。
//                    ・工事区分の番号がローマ数字（Ⅰ・Ⅱ・Ⅲ）の見積書
//                    ・「小　　　計」「計」のように全角スペースが入った小計・計の行
//                    ・「仮設費」→「仮設工事費」など、経費の名前ゆれを吸収
//                    合計の突合は、1行ずつ丸める前の金額で行う（1円ズレで取り込めない問題の対策）。
//                    プレビューの行番号をExcelの行番号と合わせた。
// ============================================================
'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import { VERSION } from '@/lib/version'
import { parseSheetRows, buildSectionMatches } from '@/lib/importExcel'
import type { PreviewRow, SectionMatch, SheetRow } from '@/lib/importExcel'

// ファイル名からメタ情報を取得
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
  const title = parts.slice(2, parts.length - 2).join('')
  return { date, building, title, staff, work_type: workType }
}

type HeaderInfo = {
  date: string; building: string; title: string
  staff: string; work_type: string
}

// 取り込んだExcelを紐づける先（既存見積のグループ代表＝最新版）
type LinkTarget = {
  id: number; base_id: number|null
  date: string; building: string; title: string
  staff: string; work_type: string
  version: string|null; input_by: string|null
}

const LAST_VERSION_INDEX = 25   // 版文字はA〜Z（Zを超えた分はZ止め）

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
  const [sectionMatches, setSectionMatches] = useState<SectionMatch[]>([])
  const [excelTotals, setExcelTotals] = useState<Record<string, number>>({})   // Excelに書かれている工事区分ごとの「計」
  const [buildingList, setBuildingList] = useState<string[]>(['新宿FT', '新宿ESS'])
  const [linkTargets, setLinkTargets] = useState<LinkTarget[]>([])
  const [linkId, setLinkId] = useState<number|null>(null)   // null = 紐づけずに新規登録

  useEffect(() => { loadBuildings(); loadLinkTargets() }, [])

  const loadBuildings = async () => {
    const { data } = await supabase.from('buildings').select('name').order('sort_order')
    if (data && data.length > 0) setBuildingList(data.map((b: {name: string}) => b.name))
  }

  // 紐づけ先の候補。同じグループは最新版だけを代表として並べる
  const loadLinkTargets = async () => {
    const { data } = await supabase.from('estimates')
      .select('id,base_id,date,building,title,staff,work_type,version,input_by')
      .order('date', { ascending: false })
    const list = (data || []) as LinkTarget[]
    const latestPerGroup = list.filter(e => {
      const baseId = e.base_id || e.id
      const group = list.filter(x => (x.base_id || x.id) === baseId)
      return e.id === Math.max(...group.map(x => x.id))
    })
    setLinkTargets(latestPerGroup)
  }

  const ensureBuilding = async (name: string) => {
    if (!name) return
    const { data } = await supabase.from('buildings').select('id').eq('name', name)
    if (data && data.length === 0) {
      const { data: maxData } = await supabase.from('buildings').select('sort_order').order('sort_order', { ascending: false }).limit(1)
      const nextOrder = maxData && maxData.length > 0 ? ((maxData[0] as any).sort_order || 0) + 1 : 1
      await supabase.from('buildings').insert({ name, sort_order: nextOrder })
      await loadBuildings()
    }
  }

  // ファイル名の件名から紐づけ先を自動で選ぶ（見つからなければ新規のまま）
  const autoSelectLink = (title: string) => {
    if (!title) { setLinkId(null); return }
    const hit = linkTargets.find(t => t.title === title)
    setLinkId(hit ? hit.id : null)
  }

  const handleFile = async (file: File) => {
    setErrorMsg('')
    setFileName(file.name)
    const info = parseFileName(file.name)
    setHeaderInfo(info)
    autoSelectLink(info.title)

    // 新しいビル名があれば自動追加
    await ensureBuilding(info.building)

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellFormula: false })
      const sheetNames = wb.SheetNames
      const targetSheet = sheetNames.find(n =>
        n.includes('建築') || n.includes('工事') || n.includes('明細')
      ) || sheetNames[0]
      const ws = wb.Sheets[targetSheet]
      // 空行も読み込む（プレビューの行番号をExcelの行番号と合わせるため）
      const startRow = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r + 1 : 1
      const rows = XLSX.utils.sheet_to_json<SheetRow>(ws, { header: 'A', defval: null, blankrows: true })

      const { rows: parsed, excelTotals: totals, sectionFound } = parseSheetRows(rows, startRow)

      if (parsed.length === 0) {
        setErrorMsg(sectionFound
          ? `「${targetSheet}」シートに明細が見つかりませんでした。C列:名称／D列:仕様／E列:数量／F列:単位／G列:単価／H列:金額 の並びになっているか確認してください。`
          : `「${targetSheet}」シートに工事区分の行が見つかりませんでした。B列に番号（1・2・3…）かローマ数字（Ⅰ・Ⅱ・Ⅲ…）、C列に工事区分名（解体工事など）が入っているか確認してください。`)
        return
      }

      setExcelTotals(totals)
      setSectionMatches(buildSectionMatches(parsed, totals))
      setPreviewRows(parsed)
      setStep('preview')
    } catch (e: any) {
      setErrorMsg('ファイルの読み込みに失敗しました: ' + (e?.message || String(e)))
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  // 行を消したら合計の突合もやり直す
  const deleteRow = (idx: number) => setPreviewRows(prev => {
    const next = prev.filter((_, i) => i !== idx)
    setSectionMatches(buildSectionMatches(next, excelTotals))
    return next
  })

  const updateRow = (idx: number, field: keyof PreviewRow, value: string) => {
    setPreviewRows(prev => {
      const next = prev.map((r, i) => {
        if (i !== idx) return r
        const updated = { ...r, [field]: value }
        const q = parseFloat(updated.quantity) || 0
        const p = parseFloat(updated.unit_price) || 0
        updated.rawAmount = q * p
        updated.amount = Math.round(updated.rawAmount)
        updated.warning = !updated.work_section || !updated.quantity || !updated.unit_price
        return updated
      })
      setSectionMatches(buildSectionMatches(next, excelTotals))
      return next
    })
  }

  const handleImport = async () => {
    setErrorMsg('')
    if (!headerInfo.date) { setErrorMsg('日付を入力してください'); return }
    if (!headerInfo.title) { setErrorMsg('件名を入力してください'); return }
    if (previewRows.length === 0) { setErrorMsg('明細データがありません'); return }

    setImporting(true)
    try {
      // ビル名が変更されている場合も自動追加
      await ensureBuilding(headerInfo.building)

      // 元の見積を選んでいれば、そのグループの次の版として保存する
      const target = linkTargets.find(t => t.id === linkId) || null
      let version = 'A'
      let baseId: number|null = null
      if (target) {
        baseId = target.base_id || target.id
        const { data: vData } = await supabase.from('estimates')
          .select('id').or(`base_id.eq.${baseId},id.eq.${baseId}`)
        version = String.fromCharCode(65 + Math.min((vData || []).length, LAST_VERSION_INDEX))
      }

      const { data: estData, error: estError } = await supabase
        .from('estimates').insert({
          date: headerInfo.date, building: headerInfo.building,
          title: headerInfo.title, staff: headerInfo.staff,
          work_type: headerInfo.work_type,
          version, base_id: baseId,
          input_by: target ? target.input_by : null,
        }).select('id').single()

      if (estError || !estData) {
        setErrorMsg('見積ヘッダーの保存に失敗しました: ' + (estError?.message || ''))
        setImporting(false); return
      }

      const estimateId = estData.id
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
        source_flag: 1,
      }))

      const { error: itemsError } = await supabase.from('estimate_items').insert(itemsToInsert)
      if (itemsError) {
        await supabase.from('estimates').delete().eq('id', estimateId)
        setErrorMsg('明細データの保存に失敗しました: ' + itemsError.message)
        setImporting(false); return
      }

      if (!baseId) {
        // 新規グループは自分自身をグループの起点にする
        await supabase.from('estimates').update({ base_id: estimateId }).eq('id', estimateId)
      }
      await loadLinkTargets()

      setDoneMsg(target
        ? `取り込み完了！「${target.title}」の${version}版として${previewRows.length}行を登録しました。過去の版も履歴の版ボタンから見られます。`
        : `取り込み完了！ 新規の見積として${previewRows.length}行を登録しました。`)
      setStep('done')
    } catch (e: any) {
      setErrorMsg('予期しないエラーが発生しました: ' + (e?.message || String(e)))
    }
    setImporting(false)
  }

  const warningCount = previewRows.filter(r => r.warning).length
  const allMatched = sectionMatches.length > 0 && sectionMatches.every(m => m.matched)
  const sections = [...new Set(previewRows.filter(r => !r.work_section.startsWith('経費_')).map(r => r.work_section))]

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
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed border-blue-300 rounded-xl p-10 text-center hover:bg-blue-50 transition-colors cursor-pointer"
            onClick={() => document.getElementById('fileInput')?.click()}>
            <div className="text-4xl mb-3">📂</div>
            <div className="text-sm text-gray-600 mb-1">ここにExcelファイルをドラッグ＆ドロップ</div>
            <div className="text-xs text-gray-400">または クリックして選択</div>
            <input id="fileInput" type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>
          {errorMsg && <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">⚠️ {errorMsg}</div>}
          <div className="mt-4 text-xs text-gray-400">
            <div>ファイル名の形式: YYYYMMDD_ビル名_件名_担当者_工事種別.xlsx</div>
            <div className="mt-1">例: 20251112_新宿FT_32階天井工事_大塚_C工事.xlsx</div>
            <div className="mt-1 text-blue-400">※ 新しいビル名はbuildingsテーブルに自動追加されます</div>
          </div>
        </div>
      </div>
    </main>
  )

  // ==================== STEP: preview ====================
  if (step === 'preview') return (
    <main className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm px-4 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { setStep('upload'); setPreviewRows([]) }}
            className="bg-gray-500 text-white px-3 py-1 rounded text-xs">← 戻る</button>
          <span className="text-sm font-bold text-gray-700">プレビュー確認</span>
          <span className="text-xs text-gray-500">{fileName}</span>
          <span className="text-xs text-gray-400 ml-1">{VERSION}</span>
          {warningCount > 0 && <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded">⚠️ {warningCount}行 要確認</span>}
          <div className="ml-auto flex gap-2 items-center">
            <span className="text-xs text-gray-500">{previewRows.length}行</span>
            <button onClick={handleImport} disabled={importing || !allMatched}
              className={`px-4 py-1.5 rounded text-sm font-bold transition-colors ${allMatched ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
              title={allMatched ? 'SupabaseにINSERTする' : '全工事区分の合計が一致してから取り込めます'}>
              {importing ? '取り込み中...' : allMatched ? '取り込む' : '合計不一致のため取り込み不可'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-2 pb-1">
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-400">日付<span className="text-red-400">*</span></label>
            <input type="date" className="border rounded px-2 py-0.5 text-xs w-32"
              value={headerInfo.date} onChange={e => setHeaderInfo({...headerInfo, date: e.target.value})} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-400">ビル名</label>
            <select className="border rounded px-1 py-0.5 text-xs w-28"
              value={headerInfo.building} onChange={e => setHeaderInfo({...headerInfo, building: e.target.value})}>
              {buildingList.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-0.5 flex-1 min-w-[160px]">
            <label className="text-xs text-gray-400">件名<span className="text-red-400">*</span></label>
            <input type="text" className="border rounded px-2 py-0.5 text-xs w-full"
              value={headerInfo.title} onChange={e => setHeaderInfo({...headerInfo, title: e.target.value})} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-400">担当者</label>
            <input type="text" className="border rounded px-2 py-0.5 text-xs w-16"
              value={headerInfo.staff} onChange={e => setHeaderInfo({...headerInfo, staff: e.target.value})} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-400">種別</label>
            <select className="border rounded px-1 py-0.5 text-xs w-20"
              value={headerInfo.work_type} onChange={e => setHeaderInfo({...headerInfo, work_type: e.target.value})}>
              {['A工事','B工事','C工事'].map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-0.5 flex-1 min-w-[220px]">
            <label className="text-xs text-gray-400">元の見積（選ぶと次の版として保存されます）</label>
            <select className={`border rounded px-1 py-0.5 text-xs w-full ${linkId ? 'bg-blue-50 border-blue-400' : ''}`}
              value={linkId ?? ''}
              onChange={e => setLinkId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">紐づけない（新しい見積として登録）</option>
              {linkTargets.map(t => (
                <option key={t.id} value={t.id}>
                  {t.title}／{t.date}／{t.building}／{t.staff}（現在 版{t.version || 'A'}）
                </option>
              ))}
            </select>
          </div>
        </div>
        {linkId
          ? <div className="mt-1 bg-blue-50 border border-blue-200 rounded px-3 py-1 text-xs text-blue-800">
              この見積の<b>次の版</b>として保存します。過去の版はそのまま残り、履歴画面の版ボタンで行き来できます。
            </div>
          : <div className="mt-1 bg-gray-50 border border-gray-200 rounded px-3 py-1 text-xs text-gray-600">
              紐づけ先が選ばれていません。このまま取り込むと<b>新しい見積</b>として登録されます。
            </div>}
        {errorMsg && <div className="mt-1 bg-red-50 border border-red-200 rounded px-3 py-1 text-xs text-red-700">⚠️ {errorMsg}</div>}
      </div>

      <div className="p-4 max-w-6xl mx-auto">
        <div className="bg-white rounded-lg border mb-4 overflow-hidden">
          <div className="bg-gray-800 text-white px-4 py-2 text-sm font-bold">工事区分 合計確認（全て✓になると取り込み可能）</div>
          <table className="w-full text-xs">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left">工事区分</th>
                <th className="p-2 text-right">Excelの計</th>
                <th className="p-2 text-right">計算合計</th>
                <th className="p-2 text-right">差額</th>
                <th className="p-2 text-center w-12">判定</th>
              </tr>
            </thead>
            <tbody>
              {sectionMatches.map(m => (
                <tr key={m.name} className={`border-t ${m.matched ? 'bg-green-50' : 'bg-red-50'}`}>
                  <td className="p-2 font-medium">{m.name}</td>
                  <td className="p-2 text-right">{m.excelTotal.toLocaleString()} 円</td>
                  <td className="p-2 text-right">{m.calcTotal.toLocaleString()} 円</td>
                  <td className={`p-2 text-right ${m.matched ? 'text-gray-400' : 'text-red-600 font-bold'}`}>
                    {m.matched ? '—' : `${(m.calcTotal - m.excelTotal).toLocaleString()} 円`}
                  </td>
                  <td className="p-2 text-center text-lg">{m.matched ? '✅' : '❌'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sections.map(section => {
          const sectionRows = previewRows.filter(r => r.work_section === section)
          const expenseRows = previewRows.filter(r => r.work_section === `経費_${section}`)
          const sectionTotal = sectionRows.reduce((sum, r) => sum + r.amount, 0)
          const expenseTotal = expenseRows.reduce((sum, r) => sum + r.amount, 0)
          const allRows = [...sectionRows, ...expenseRows]
          return (
            <div key={section} className="mb-6">
              <div className="bg-blue-800 text-white px-4 py-2 rounded-t flex justify-between">
                <span className="font-bold text-sm">{section}</span>
                <span className="text-xs">小計 {sectionTotal.toLocaleString()} 円　経費 {expenseTotal.toLocaleString()} 円</span>
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
                    {allRows.map(row => {
                      const idx = previewRows.indexOf(row)
                      const isExpense = row.work_section.startsWith('経費_')
                      return (
                        <tr key={idx} className={`border-t ${row.warning ? 'bg-yellow-50' : isExpense ? 'bg-gray-50' : ''}`}>
                          <td className="p-1 text-center text-gray-400">
                            {row.warning ? <span title={row.warningMsg} className="text-yellow-600 cursor-help">⚠️</span> : <span className="text-gray-300">{row.rowNum}</span>}
                          </td>
                          <td className="p-1">
                            <input className="w-full border rounded px-1 py-0.5 mb-0.5 text-xs" value={row.name1} onChange={e => updateRow(idx, 'name1', e.target.value)} />
                            {(row.name2 || row.name3) && <>
                              <input className="w-full border rounded px-1 py-0.5 mb-0.5 text-xs text-gray-500" value={row.name2} onChange={e => updateRow(idx, 'name2', e.target.value)} />
                              <input className="w-full border rounded px-1 py-0.5 text-xs text-gray-500" value={row.name3} onChange={e => updateRow(idx, 'name3', e.target.value)} />
                            </>}
                          </td>
                          <td className="p-1">
                            <input className="w-full border rounded px-1 py-0.5 mb-0.5 text-xs" value={row.spec1} onChange={e => updateRow(idx, 'spec1', e.target.value)} />
                            {(row.spec2 || row.spec3) && <>
                              <input className="w-full border rounded px-1 py-0.5 mb-0.5 text-xs text-gray-500" value={row.spec2} onChange={e => updateRow(idx, 'spec2', e.target.value)} />
                              <input className="w-full border rounded px-1 py-0.5 text-xs text-gray-500" value={row.spec3} onChange={e => updateRow(idx, 'spec3', e.target.value)} />
                            </>}
                          </td>
                          <td className="p-1"><input className="w-full border rounded px-1 py-0.5 text-xs text-right" value={row.quantity} type="number" onChange={e => updateRow(idx, 'quantity', e.target.value)} /></td>
                          <td className="p-1"><input className="w-full border rounded px-1 py-0.5 text-xs" value={row.unit} onChange={e => updateRow(idx, 'unit', e.target.value)} /></td>
                          <td className="p-1"><input className="w-full border rounded px-1 py-0.5 text-xs text-right" value={row.unit_price} type="number" onChange={e => updateRow(idx, 'unit_price', e.target.value)} /></td>
                          <td className="p-1 text-right pr-2">{row.amount.toLocaleString()}</td>
                          <td className="p-1"><input className="w-full border rounded px-1 py-0.5 text-xs" value={row.note1} onChange={e => updateRow(idx, 'note1', e.target.value)} /></td>
                          <td className="p-1 text-center"><button onClick={() => deleteRow(idx)} className="text-red-400 hover:text-red-600 text-xs">✕</button></td>
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
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-blue-700">続けて取り込む</button>
          <a href="/history" className="border border-gray-300 text-gray-600 px-4 py-2 rounded text-sm text-center hover:bg-gray-50">historyに戻る</a>
        </div>
      </div>
    </main>
  )
}
