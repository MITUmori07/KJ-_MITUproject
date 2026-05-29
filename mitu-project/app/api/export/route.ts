// ============================================================
// ディレクトリ: mitu-project/app/api/export/
// ファイル名: route.ts
// バージョン: V6.0.18d
// 更新: 2026/05/27
// 変更: V6.0.18d feat: ヘッダーL/M/N列ラベル・運搬費O/P列ラベル追加
// ============================================================

export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { VERSION } from '@/lib/version'

const FONT = 'BIZ UDゴシック'
const DATA_ROWS = 25
const SUBTOTAL_ROWS = 6
const THIN = { style: 'thin' as const }
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN }
const NUM_FMT = '#,##0'
const DEC_FMT = '#,##0.0'

export async function POST(req: NextRequest) {
  const { date, building, title, staff, work_type, sections } = await req.json()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('建築')
  ws.columns = [
    { width: 3.0 }, { width: 4.4 }, { width: 24.1 }, { width: 29.3 },
    { width: 12.0 }, { width: 4.9 }, { width: 13.7 }, { width: 15.1 }, { width: 17.7 }
  ]

  let r = 1
  let pageNum = 2
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
    const p = ws.getRow(r)
    p.getCell(9).value = 'P.  ' + pageNum
    p.getCell(9).font = f(10)
    p.getCell(10).value = VERSION
    p.getCell(10).font = { name: FONT, size: 8, color: { argb: 'FF999999' } }
    p.height = 15.95; r++
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
    ;[3,5,6,7,8,9].forEach(i => {
      h.getCell(i).font = f(10)
      h.getCell(i).alignment = { horizontal: 'center', vertical: 'middle' }
    })
    h.getCell(12).value = '労務比率'; h.getCell(12).font = { name: FONT, size: 8, color: { argb: 'FF999999' } }
    h.getCell(13).value = '搬入除外計'; h.getCell(13).font = { name: FONT, size: 8, color: { argb: 'FF999999' } }
    h.getCell(14).value = '計×労務比率'; h.getCell(14).font = { name: FONT, size: 8, color: { argb: 'FF999999' } }
    bd(h); r++
  }

  const addEmptyRow = () => {
    const er = ws.getRow(r); er.height = 37.5; bd(er); r++; usedRows++
  }

  // 経費はhistory画面から渡された値をそのまま使用
  const getSectionTotal = (section: any) => section.sectionTotal || 0

  const writeSubtotal = (section: any, sIdx: number, firstDataRow: number|null, lastDataRow: number|null, nightNRows: number[], firstNightRow: any, hakobiExcludedTotal: number) => {
    const subtotal = section.rows.reduce((s: number, row: any) => s + (row.amount || 0), 0)
    const isTokkyu = section.name.startsWith('特殊仮設工事')
    const keihi = isTokkyu ? 0 : (section.keihi || 0)
    const unban = section.unban || 0
    const night = section.night || 0
    const genba = section.genba || 0
    const sectionTotal = section.sectionTotal || 0

    const items: [string, number|null, number, string, string][] = [
      ['小計', null, Math.round(subtotal), '', 'subtotal'],
      ...(!isTokkyu ? [['仮設工事費', 1, keihi, '式', 'keihi'] as [string, number|null, number, string, string]] : []),
      ['運搬費', 1, unban, '式', 'unban'],
      ['夜間割増費', 1, night, '式', 'night'],
      ['現場経費', 1, genba, '式', 'genba'],
      [(sIdx+1) + '- ' + section.name + 'の計', null, Math.round(sectionTotal), '', 'total'],
    ]
    const actualRows = items.length
    const remaining = DATA_ROWS - usedRows
    if (remaining < actualRows) {
      while (usedRows < DATA_ROWS) addEmptyRow()
      addPageNum(); addHeader()
    }
    while (usedRows < DATA_ROWS - actualRows) addEmptyRow()

    let subtotalRow: number|null = null
    items.forEach(([name, qty, amt, unit, key]) => {
      const sr = ws.getRow(r)
      sr.getCell(3).value = name; sr.getCell(3).font = f(10)
      if (qty !== null) {
        sr.getCell(5).value = qty; sr.getCell(5).font = f(10)
        sr.getCell(5).numFmt = DEC_FMT
      }
      if (unit) { sr.getCell(6).value = unit; sr.getCell(6).font = f(10) }
      sr.getCell(8).value = amt; sr.getCell(8).font = f(10)
      sr.getCell(8).numFmt = NUM_FMT

      // M列: 検算式
      if (key === 'subtotal') {
        subtotalRow = r
        if (firstDataRow && lastDataRow) {
          sr.getCell(8).value = { formula: `SUM(H${firstDataRow}:H${lastDataRow})` }
          sr.getCell(13).value = { formula: `SUM(M${firstDataRow}:M${lastDataRow})` }
          sr.getCell(13).numFmt = NUM_FMT
          sr.getCell(13).font = { name: FONT, size: 8, color: { argb: 'FF0066CC' } }
        }
      } else if (key === 'keihi' && subtotalRow) {
        sr.getCell(13).value = { formula: `FLOOR(H${subtotalRow}*0.07,10)` }
        sr.getCell(13).numFmt = NUM_FMT
        sr.getCell(13).font = { name: FONT, size: 8, color: { argb: 'FF0066CC' } }
        sr.getCell(12).value = '7%'
        sr.getCell(12).font = { name: FONT, size: 8, color: { argb: 'FF999999' } }
      } else if (key === 'unban' && subtotalRow) {
        sr.getCell(13).value = { formula: `FLOOR(M${subtotalRow}*0.02,10)` }
        sr.getCell(13).numFmt = NUM_FMT
        sr.getCell(13).font = { name: FONT, size: 8, color: { argb: 'FF0066CC' } }
        sr.getCell(12).value = '2%'
        sr.getCell(12).font = { name: FONT, size: 8, color: { argb: 'FF999999' } }
        if (hakobiExcludedTotal > 0) {
          sr.getCell(14).value = `運搬除外計  ${Math.round(hakobiExcludedTotal).toLocaleString()}`
          sr.getCell(14).font = { name: FONT, size: 8, color: { argb: 'FF666666' } }
        }
        sr.getCell(15).value = '夜間割増'; sr.getCell(15).font = { name: FONT, size: 8, color: { argb: 'FF999999' } }
        sr.getCell(16).value = '深夜率';   sr.getCell(16).font = { name: FONT, size: 8, color: { argb: 'FF999999' } }
      } else if (key === 'night' && nightNRows.length > 0) {
        const nightRow = r
        const sumFormula = nightNRows.length === 1
          ? `N${nightNRows[0]}`
          : `SUM(${nightNRows.map(rn => `N${rn}`).join(',')})`
        const lr = firstNightRow ? (parseFloat(firstNightRow.laborRate) || 60) / 100 : 0.6
        const dp = firstNightRow ? (parseFloat(firstNightRow.nightDeepRate) || 0) / 100 : 0
        const RED = { name: FONT, size: 8, color: { argb: 'FFCC0000' } }
        sr.getCell(14).value = { formula: sumFormula }; sr.getCell(14).numFmt = NUM_FMT; sr.getCell(14).font = RED
        sr.getCell(15).value = 0.5;  sr.getCell(15).numFmt = '0%'; sr.getCell(15).font = RED
        sr.getCell(16).value = lr;   sr.getCell(16).numFmt = '0%'; sr.getCell(16).font = RED
        if (dp > 0) {
          sr.getCell(17).value = dp; sr.getCell(17).numFmt = '0%'; sr.getCell(17).font = RED
        }
        // R列廃止・H式: =N*(O+Q)
        sr.getCell(8).value = { formula: `N${nightRow}*(O${nightRow}+Q${nightRow})` }
        sr.getCell(8).numFmt = NUM_FMT; sr.getCell(8).font = { name: FONT, size: 10, color: { argb: 'FFCC0000' } }
      } else if (key === 'total') {
        sr.getCell(13).value = amt
        sr.getCell(13).numFmt = NUM_FMT
        sr.getCell(13).font = { name: FONT, size: 8, color: { argb: 'FF0066CC' } }
      }

      sr.height = 37.5; bd(sr); r++; usedRows++
    })
  }

  // === ページ1: サマリー固定レイアウト ===
  r = 1; ws.getRow(r).height = 15.95; r++
  const h2 = ws.getRow(r)
  h2.getCell(3).value = '名　　　称　・　仕　　　様'
  h2.getCell(5).value = '数　量'; h2.getCell(6).value = '単位'
  h2.getCell(7).value = '単　価'; h2.getCell(8).value = '金　額'
  h2.getCell(9).value = '備　考'; h2.height = 26.1
  ;[3,5,6,7,8,9].forEach(i => {
    h2.getCell(i).font = f(10)
    h2.getCell(i).alignment = { horizontal: 'center', vertical: 'middle' }
  })
  h2.getCell(12).value = '労務比率'; h2.getCell(12).font = { name: FONT, size: 8, color: { argb: 'FF999999' } }
  h2.getCell(13).value = '搬入除外計'; h2.getCell(13).font = { name: FONT, size: 8, color: { argb: 'FF999999' } }
  h2.getCell(14).value = '計×労務比率'; h2.getCell(14).font = { name: FONT, size: 8, color: { argb: 'FF999999' } }
  bd(h2); r++
  const tRow = ws.getRow(r)
  tRow.getCell(2).value = 'Ⅱ'; tRow.getCell(3).value = '建築工事'
  ;[2,3].forEach(i => tRow.getCell(i).font = f(10))
  tRow.height = 37.5; bd(tRow); r++
  const nRow = ws.getRow(r)
  nRow.getCell(3).value = '（内訳）'; nRow.getCell(3).font = f(10)
  nRow.height = 37.5; bd(nRow); r++
  const e1 = ws.getRow(r); e1.height = 37.5; bd(e1); r++
  sections.forEach((section: any, idx: number) => {
    const sr = ws.getRow(r)
    sr.getCell(2).value = idx + 1; sr.getCell(3).value = section.name
    sr.getCell(5).value = 1; sr.getCell(6).value = '式'
    sr.getCell(5).numFmt = DEC_FMT
    sr.getCell(8).value = Math.round(getSectionTotal(section))
    sr.getCell(8).numFmt = NUM_FMT
    ;[2,3,5,6,8].forEach(i => sr.getCell(i).font = f(10))
    sr.height = 37.5; bd(sr); r++
  })
  while (r < 13) { const er = ws.getRow(r); er.height = 37.5; bd(er); r++ }
  const gtRow = ws.getRow(r)
  gtRow.getCell(4).value = 'Ⅱ- 建築工事の計'
  gtRow.getCell(8).value = Math.round(sections.reduce((s: number, sec: any) => s + getSectionTotal(sec), 0))
  gtRow.getCell(8).numFmt = NUM_FMT
  ;[4,8].forEach(i => gtRow.getCell(i).font = f(10))
  gtRow.height = 37.5; bd(gtRow); r++
  while (r <= 27) { const er = ws.getRow(r); er.height = 37.5; bd(er); r++ }
  addPageNum()

  // === ページ2以降: 各工事区分明細 ===
  sections.forEach((section: any, sIdx: number) => {
    addHeader()
    const sh = ws.getRow(r)
    sh.getCell(2).value = sIdx + 1; sh.getCell(3).value = section.name
    ;[2,3].forEach(i => sh.getCell(i).font = f(10))
    sh.height = 37.5; bd(sh); r++; usedRows++

    let firstDataRow: number|null = null
    let lastDataRow: number|null = null
    let nightNRows: number[] = []
    let firstNightRow: any = null
    let hakobiExcludedTotal = 0

    section.rows.forEach((row: any) => {
      if (usedRows >= DATA_ROWS) {
        addPageNum(); addHeader()
      }
      if (firstDataRow === null) firstDataRow = r
      lastDataRow = r

      const [n1,n2,n3] = bottomAlign(row.name1||'', row.name2||'', row.name3||'')
      const [s1,s2,s3] = bottomAlign(row.spec1||'', row.spec2||'', row.spec3||'')
      const [o1,o2,o3] = bottomAlign(row.note1||'', row.note2||'', row.note3||'')
      const name = [n1,n2,n3].filter(Boolean).join('\n')
      const spec = [s1,s2,s3].filter(Boolean).join('\n')
      const note = [o1,o2,o3].filter(Boolean).join('\n')
      const dr = ws.getRow(r)
      dr.getCell(3).value = name; dr.getCell(3).alignment = { wrapText: true, vertical: 'bottom' }; dr.getCell(3).font = f(10)
      dr.getCell(4).value = spec; dr.getCell(4).alignment = { wrapText: true, vertical: 'bottom' }; dr.getCell(4).font = f(9)
      const qty = parseFloat(row.quantity)||null
      dr.getCell(5).value = qty; dr.getCell(5).font = f(10)
      if (qty !== null) dr.getCell(5).numFmt = DEC_FMT
      dr.getCell(6).value = row.unit||''; dr.getCell(6).font = f(10)
      const unitPrice = parseFloat(row.unit_price)||null
      dr.getCell(7).value = unitPrice; dr.getCell(7).font = f(10)
      if (unitPrice !== null) dr.getCell(7).numFmt = NUM_FMT
      dr.getCell(8).value = Math.round(row.amount || 0)
      dr.getCell(8).font = f(10)
      dr.getCell(8).numFmt = NUM_FMT
      dr.getCell(9).value = note; dr.getCell(9).alignment = { wrapText: true, vertical: 'bottom' }; dr.getCell(9).font = f(9)
      dr.getCell(13).value = row.excludeHakobi ? 0 : Math.round(row.amount || 0)
      dr.getCell(13).numFmt = NUM_FMT
      dr.getCell(13).font = { name: FONT, size: 8, color: { argb: 'FF0066CC' } }
      // 印刷範囲外（J〜N列）
      if (row.excludeHakobi) {
        dr.getCell(10).value = '搬除外'
        dr.getCell(10).font = { name: FONT, size: 8, color: { argb: 'FFCC6600' } }
        hakobiExcludedTotal += row.amount || 0
      }
      if (row.nightWork) {
        dr.getCell(11).value = '夜'
        dr.getCell(11).font = { name: FONT, size: 8, color: { argb: 'FFCC0000' } }
        const lr = parseFloat(row.laborRate) || 60
        dr.getCell(12).value = lr / 100
        dr.getCell(12).numFmt = '0%'
        dr.getCell(12).font = { name: FONT, size: 8, color: { argb: 'FFCC0000' } }
        const nightBase = Math.round((row.amount || 0) * lr / 100)
        dr.getCell(14).value = nightBase
        dr.getCell(14).numFmt = NUM_FMT
        dr.getCell(14).font = { name: FONT, size: 8, color: { argb: 'FFCC0000' } }
        nightNRows.push(r)
        if (!firstNightRow) firstNightRow = row
        // 夜間行は全セル赤字
        const sizes: {[k:number]:number} = {3:10,4:9,5:10,6:10,7:10,8:10,9:9}
        for (let col = 3; col <= 9; col++) {
          dr.getCell(col).font = { name: FONT, size: sizes[col] || 10, color: { argb: 'FFCC0000' } }
        }
      } else {
        if (row.excludeHakobi) {
          // 搬除外のみ（夜間なし）
        } else {
          // 通常行はL列非表示
        }
      }
      dr.height = 37.5; bd(dr); r++; usedRows++
    })
    writeSubtotal(section, sIdx, firstDataRow, lastDataRow, nightNRows, firstNightRow, hakobiExcludedTotal)
    addPageNum()
  })

  // 印刷設定
  ws.pageSetup.paperSize = 9  // A4
  ws.pageSetup.fitToPage = true
  ws.pageSetup.fitToWidth = 1
  ws.pageSetup.fitToHeight = 0

  // 余白設定（cm → インチ換算）
  ws.pageSetup.margins = {
    top: 2.0 / 2.54,
    bottom: 1.0 / 2.54,
    left: 1.5 / 2.54,
    right: 1.0 / 2.54,
    header: 0.8 / 2.54,
    footer: 0.8 / 2.54,
  }

  const totalRows = r - 1
  for (let br = 29; br <= totalRows; br += 29) {
    ws.getRow(br).addPageBreak()
  }

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
