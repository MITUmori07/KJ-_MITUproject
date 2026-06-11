// ============================================================
// ディレクトリ: mitu-project/app/api/export-list/
// ファイル名: route.ts
// バージョン: V1.0.1
// 作成: 2026/05/27
// 更新: V1.0.1 fix: バッファ変換修正（Buffer.from）でExcel破損を解消
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export const runtime = 'nodejs'

const FONT = 'BIZ UDゴシック'
const FONT_SIZE = 10
const NUM_FMT = '#,##0'
const QTY_FMT = '0.0'

const FILL_HEADER = 'FFD9D9D9'
const FILL_EXPENSE = 'FFF2F2F2'
const FILL_TOTAL   = 'FFE2EFDA'

const HEADERS    = ['工種名称', '名称', '仕様', '数量', '単位', '単価', '金額', '備考']
const COL_WIDTHS = [14, 30, 24, 8, 6, 12, 12, 20]

type ExportRow = {
  name1?: string | null; name2?: string | null
  spec1?: string | null
  quantity?: string | number | null
  unit?: string | null
  unit_price?: string | number | null
  amount?: number | null
  note1?: string | null
}
type ExportSection = {
  name: string
  rows: ExportRow[]
  keihi?: number; unban?: number; night?: number; genba?: number
  sectionTotal?: number
}
type ExportBody = {
  date?: string; building?: string; title?: string
  staff?: string; work_type?: string
  sections: ExportSection[]
}

const toNum = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(n) ? null : n
}

type CellOpts = {
  bold?: boolean
  numFmt?: string
  align?: 'left' | 'center' | 'right'
  fill?: string
}

const applyCell = (
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: ExcelJS.CellValue,
  opts: CellOpts = {}
) => {
  const cell = ws.getCell(row, col)
  cell.value = value
  cell.font = { name: FONT, size: FONT_SIZE, bold: !!opts.bold }
  if (opts.numFmt) cell.numFmt = opts.numFmt
  if (opts.align)  cell.alignment = { horizontal: opts.align, vertical: 'middle' }
  if (opts.fill)   cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } }
  return cell
}

const fillRow = (ws: ExcelJS.Worksheet, row: number, bold: boolean, fill?: string) => {
  for (let c = 1; c <= 8; c++) {
    const cell = ws.getCell(row, c)
    cell.font = { name: FONT, size: FONT_SIZE, bold }
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ExportBody
    const sections = body?.sections ?? []

    if (sections.length === 0) {
      return NextResponse.json({ error: '明細データがありません' }, { status: 400 })
    }

    const wb = new ExcelJS.Workbook()
    wb.creator  = 'KJM'
    wb.created  = new Date()

    // シート名の重複・禁止文字対策
    const usedNames = new Set<string>()
    const safeSheetName = (raw: string) => {
      let n = (raw || 'シート').replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'シート'
      const base = n; let i = 2
      while (usedNames.has(n)) {
        const sfx = `_${i++}`
        n = base.slice(0, 31 - sfx.length) + sfx
      }
      usedNames.add(n)
      return n
    }

    // ─── サマリーシート（先頭）───────────────────────────
    const summary = wb.addWorksheet(safeSheetName('建築工事計'))
    summary.getColumn(1).width = 30
    summary.getColumn(2).width = 16

    applyCell(summary, 1, 1, '工事区分', { bold: true, align: 'center', fill: FILL_HEADER })
    applyCell(summary, 1, 2, '金額',     { bold: true, align: 'center', fill: FILL_HEADER })

    let sr = 2
    let grand = 0
    for (const s of sections) {
      const t = toNum(s.sectionTotal) ?? 0
      applyCell(summary, sr, 1, s.name ?? '')
      applyCell(summary, sr, 2, t, { numFmt: NUM_FMT, align: 'right' })
      grand += t
      sr++
    }
    applyCell(summary, sr, 1, '建築工事の計', { bold: true, fill: FILL_TOTAL })
    applyCell(summary, sr, 2, grand,           { numFmt: NUM_FMT, align: 'right', bold: true, fill: FILL_TOTAL })

    // ─── 工事区分ごとのシート ──────────────────────────────
    for (const section of sections) {
      const ws = wb.addWorksheet(safeSheetName(section.name))
      COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })

      // ヘッダー行
      HEADERS.forEach((h, i) => applyCell(ws, 1, i + 1, h, { bold: true, align: 'center' }))
      fillRow(ws, 1, true, FILL_HEADER)

      let r = 2
      const firstDataRow = r
      let isFirst = true

      for (const row of section.rows ?? []) {
        const name1 = (row.name1 ?? '').trim()
        const name2 = (row.name2 ?? '').trim()
        const spec1  = row.spec1  ?? ''
        const note1  = row.note1  ?? ''
        const qty    = toNum(row.quantity)
        const price  = toNum(row.unit_price)
        const amount = toNum(row.amount)

        // 空行スキップ
        if (!name1 && !name2 && !spec1 && !amount) continue

        const aVal = isFirst ? section.name : ''

        const writeDetail = (rr: number) => {
          applyCell(ws, rr, 2, name1)
          applyCell(ws, rr, 3, spec1)
          if (qty    !== null) applyCell(ws, rr, 4, qty,    { numFmt: QTY_FMT, align: 'right' })
          applyCell(ws, rr, 5, row.unit ?? '', { align: 'center' })
          if (price  !== null) applyCell(ws, rr, 6, price,  { numFmt: NUM_FMT, align: 'right' })
          if (amount !== null) applyCell(ws, rr, 7, amount, { numFmt: NUM_FMT, align: 'right' })
          applyCell(ws, rr, 8, note1)
        }

        if (name2) {
          // 名称行: A=工事区分名（初回のみ）, B=name2
          applyCell(ws, r, 1, aVal, { bold: true })
          applyCell(ws, r, 2, name2)
          r++
          // 明細行: B=name1 以降
          writeDetail(r)
          r++
        } else {
          // 1段: A=工事区分名（初回のみ）, B=name1 以降
          applyCell(ws, r, 1, aVal, { bold: true })
          writeDetail(r)
          r++
        }
        isFirst = false
      }

      const lastDataRow = r - 1

      // 小計行
      applyCell(ws, r, 2, '小計', { bold: true })
      if (lastDataRow >= firstDataRow) {
        const c = ws.getCell(r, 7)
        c.value    = { formula: `SUM(G${firstDataRow}:G${lastDataRow})` }
        c.font     = { name: FONT, size: FONT_SIZE, bold: true }
        c.numFmt   = NUM_FMT
        c.alignment = { horizontal: 'right', vertical: 'middle' }
      } else {
        applyCell(ws, r, 7, 0, { numFmt: NUM_FMT, align: 'right', bold: true })
      }
      r++

      // 経費行
      const expenses: [string, number | null | undefined][] = [
        ['仮設工事費', section.keihi],
        ['運搬費',     section.unban],
        ['夜間割増費', section.night],
        ['現場経費',   section.genba],
      ]
      for (const [label, val] of expenses) {
        applyCell(ws, r, 2, label)
        applyCell(ws, r, 7, toNum(val) ?? 0, { numFmt: NUM_FMT, align: 'right' })
        fillRow(ws, r, false, FILL_EXPENSE)
        r++
      }

      // 工事区分合計行
      applyCell(ws, r, 2, `${section.name}の計`)
      applyCell(ws, r, 7, toNum(section.sectionTotal) ?? 0, { numFmt: NUM_FMT, align: 'right' })
      fillRow(ws, r, true, FILL_TOTAL)
    }

    // ─── バッファ書き出し ──────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer()

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="export-list.xlsx"',
      },
    })
  } catch (e) {
    console.error('[export-list] error:', e)
    return NextResponse.json({ error: '出力に失敗しました' }, { status: 500 })
  }
}
