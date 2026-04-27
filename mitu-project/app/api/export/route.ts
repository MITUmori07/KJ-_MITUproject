// ============================================================
// ディレクトリ: mitu-project/app/api/export/
// ファイル名: route.ts
// バージョン: V6.0.2
// 更新: 2026/04/27
// 変更: ⑧印刷設定追加（列幅に印刷・29行毎改ページ）
// ============================================================

export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

const FONT = 'BIZ UDゴシック'
const DATA_ROWS = 25
const SUBTOTAL_ROWS = 6
const THIN = { style: 'thin' as const }
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN }

export async function POST(req: NextRequest) {
  const { date, building, title, staff, work_type, sections } = await req.json()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('建築')
  ws.columns = [
    { width: 2.33 }, { width: 2.33 }, { width: 18.78 }, { width: 22.78 },
    { width: 9.33 }, { width: 3.78 }, { width: 10.78 }, { width: 11.78 }, { width: 11.78 }
  ]

  let r = 1
  let pageNum = 10
  let usedRows = 0

  const f = (size: number) => ({ name: FONT, size })
  const bd = (row: ExcelJS.Row) => { for (let i = 2; i <= 9; i++) row.getCell(i).border = BORDER }

  const bottomAlign = (a: string, b: string, c: string): [string,string,string] => {
    const vals = [a,b,c].filter(Boolean)
    if (vals.length === 3) return [a,b,c]
    if (vals.length === 2) return ['',vals[0],vals[1]]
    if (vals.length === 1) return ['','',vals[0]]
    return ['','','']
  }

  const addPageNum = () => {
    const p = ws.getRow(r); p.getCell(9).value = 'P.  ' + pageNum
    p.getCell(9).font = f(10); p.height = 15.95; r++
    ws.getRow(r).height = 15.95; r++
    pageNum++; usedRows = 0
  }

  const addHeader = () => {
    ws.getRow(r).height = 15.95; r++
    const h = ws.getRow(r)
    h.getCell(3).value = '名　　　称　・　仕　　　様'
    h.getCell(5).value = '数　量'; h.getCell(6).value = '単位'
    h.getCell(7).value = '単　価'; h.getCell(8).value = '金　額'
    h.getCell(9).value = '備　考'; h.height = 26.1
    ;[3,5,6,7,8,9].forEach(i => { h.getCell(i).font = f(10) })
    bd(h); r++
  }

  const addEmptyRow = () => {
    const er = ws.getRow(r); er.height = 36; bd(er); r++; usedRows++
  }

  const calcSub = (section: any) =>
    section.rows.reduce((s: number, row: any) =>
      s + Math.round((parseFloat(row.quantity)||0)*(parseFloat(row.unit_price)||0)), 0)

  const getSectionTotal = (section: any) => {
    const sub = calcSub(section)
    return sub + Math.round(sub*0.07) + Math.round(sub*0.02) + Math.round(sub*0.10)
  }

  const writeSubtotal = (section: any, sIdx: number) => {
    const remaining = DATA_ROWS - usedRows
    if (remaining < SUBTOTAL_ROWS) {
      while (usedRows < DATA_ROWS) addEmptyRow()
      addPageNum(); addHeader()
    }
    while (usedRows < DATA_ROWS - SUBTOTAL_ROWS) addEmptyRow()
    const subtotal = calcSub(section)
    const keihi = Math.round(subtotal * 0.07)
    const unban = Math.round(subtotal * 0.02)
    const genba = Math.round(subtotal * 0.10)
    const sectionTotal = subtotal + keihi + unban + genba
    const items: [string, number|null, number, string][] = [
      ['小計', null, Math.round(subtotal), ''],
      ['仮設工事費', 1, keihi, '式'],
      ['運搬費', 1, unban, '式'],
      ['深夜作業割増', 1, 0, '式'],
      ['現場経費', 1, genba, '式'],
      [(sIdx+1) + '- ' + section.name + 'の計', null, Math.round(sectionTotal), ''],
    ]
    items.forEach(([name, qty, amt, unit]) => {
      const sr = ws.getRow(r)
      sr.getCell(3).value = name; sr.getCell(3).font = f(10)
      if (qty !== null) { sr.getCell(5).value = qty; sr.getCell(5).font = f(10) }
      if (unit) { sr.getCell(6).value = unit; sr.getCell(6).font = f(10) }
      sr.getCell(8).value = amt; sr.getCell(8).font = f(10)
      sr.height = 36; bd(sr); r++; usedRows++
    })
  }

  // === ページ1: サマリー固定レイアウト ===
  r = 1; ws.getRow(r).height = 15.95; r++
  const h2 = ws.getRow(r)
  h2.getCell(3).value = '名　　　称　・　仕　　　様'
  h2.getCell(5).value = '数　量'; h2.getCell(6).value = '単位'
  h2.getCell(7).value = '単　価'; h2.getCell(8).value = '金　額'
  h2.getCell(9).value = '備　考'; h2.height = 26.1
  ;[3,5,6,7,8,9].forEach(i => { h2.getCell(i).font = f(10) })
  bd(h2); r++
  const tRow = ws.getRow(r)
  tRow.getCell(2).value = 'Ⅱ'; tRow.getCell(3).value = '建築工事'
  ;[2,3].forEach(i => tRow.getCell(i).font = f(10))
  tRow.height = 36; bd(tRow); r++
  const nRow = ws.getRow(r)
  nRow.getCell(3).value = '（内訳）'; nRow.getCell(3).font = f(10)
  nRow.height = 36; bd(nRow); r++
  const e1 = ws.getRow(r); e1.height = 36; bd(e1); r++
  sections.forEach((section: any, idx: number) => {
    const sr = ws.getRow(r)
    sr.getCell(2).value = idx + 1; sr.getCell(3).value = section.name
    sr.getCell(5).value = 1; sr.getCell(6).value = '式'
    sr.getCell(8).value = Math.round(getSectionTotal(section))
    ;[2,3,5,6,8].forEach(i => sr.getCell(i).font = f(10))
    sr.height = 36; bd(sr); r++
  })
  while (r < 13) { const er = ws.getRow(r); er.height = 36; bd(er); r++ }
  const gtRow = ws.getRow(r)
  gtRow.getCell(4).value = 'Ⅱ- 建築工事の計'
  gtRow.getCell(8).value = Math.round(sections.reduce((s: number, sec: any) => s + getSectionTotal(sec), 0))
  ;[4,8].forEach(i => gtRow.getCell(i).font = f(10))
  gtRow.height = 36; bd(gtRow); r++
  while (r <= 27) { const er = ws.getRow(r); er.height = 36; bd(er); r++ }
  addPageNum()

  // === ページ2以降: 各工事区分明細 ===
  sections.forEach((section: any, sIdx: number) => {
    addHeader()
    const sh = ws.getRow(r)
    sh.getCell(2).value = sIdx + 1; sh.getCell(3).value = section.name
    ;[2,3].forEach(i => sh.getCell(i).font = f(10))
    sh.height = 36; bd(sh); r++; usedRows++
    section.rows.forEach((row: any) => {
      if (usedRows >= DATA_ROWS - SUBTOTAL_ROWS - 1) {
        while (usedRows < DATA_ROWS) addEmptyRow()
        addPageNum(); addHeader()
      }
      const [n1,n2,n3] = bottomAlign(row.name1||'', row.name2||'', row.name3||'')
      const [s1,s2,s3] = bottomAlign(row.spec1||'', row.spec2||'', row.spec3||'')
      const [o1,o2,o3] = bottomAlign(row.note1||'', row.note2||'', row.note3||'')
      const name = [n1,n2,n3].filter(Boolean).join('\n')
      const spec = [s1,s2,s3].filter(Boolean).join('\n')
      const note = [o1,o2,o3].filter(Boolean).join('\n')
      const dr = ws.getRow(r)
      dr.getCell(3).value = name; dr.getCell(3).alignment = { wrapText: true, vertical: 'bottom' }; dr.getCell(3).font = f(10)
      dr.getCell(4).value = spec; dr.getCell(4).alignment = { wrapText: true, vertical: 'bottom' }; dr.getCell(4).font = f(9)
      dr.getCell(5).value = parseFloat(row.quantity)||null; dr.getCell(5).font = f(10)
      dr.getCell(6).value = row.unit||''; dr.getCell(6).font = f(10)
      dr.getCell(7).value = parseFloat(row.unit_price)||null; dr.getCell(7).font = f(10)
      dr.getCell(8).value = Math.round((parseFloat(row.quantity)||0)*(parseFloat(row.unit_price)||0)); dr.getCell(8).font = f(10)
      dr.getCell(9).value = note; dr.getCell(9).alignment = { wrapText: true, vertical: 'bottom' }; dr.getCell(9).font = f(9)
      dr.height = 36; bd(dr); r++; usedRows++
    })
    writeSubtotal(section, sIdx)
    addPageNum()
  })

  // ▼ V6.0.2: ⑧ 印刷設定
  // 列幅に印刷（fitToPage）
  ws.pageSetup.fitToPage = true
  ws.pageSetup.fitToWidth = 1
  ws.pageSetup.fitToHeight = 0  // 縦は自動

  // 29行毎に明示的な改ページを追加
  const totalRows = r - 1
  const rowBreaks: { id: number }[] = []
  for (let br = 29; br <= totalRows; br += 29) {
    rowBreaks.push({ id: br })
  }
  ;(ws as any).rowBreaks = rowBreaks

  const arrayBuffer = await wb.xlsx.writeBuffer()
  const buffer = Buffer.from(new Uint8Array(arrayBuffer))
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="estimate.xlsx"'
    }
  })
}
