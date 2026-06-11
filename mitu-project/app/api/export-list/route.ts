// ============================================================
// ディレクトリ: mitu-project/app/api/export-list/
// ファイル名: route.ts
// バージョン: V1.1.0
// 作成: 2026/05/27
// 更新: V1.1.0 feat: 1行2段レイアウト実装・列幅/行高/罫線/フォント修正
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export const runtime = 'nodejs'

const FONT        = 'MS Pゴシック'
const SIZE_TITLE  = 9
const SIZE_DETAIL = 11
const HEIGHT_TITLE  = 25.5   // 34px × 0.75pt
const HEIGHT_DETAIL = 12.75  // 17px × 0.75pt  ← 固定

// 列幅（px ÷ 7 で換算）A〜H
const COL_WIDTHS = [5, 28, 35, 12, 6, 13, 14, 14]

const NUM_FMT = '#,##0'
const QTY_FMT = '0.0'

const FILL_HEADER  = 'FFD9D9D9'
const FILL_EXPENSE = 'FFF2F2F2'
const FILL_TOTAL   = 'FFE2EFDA'

const HEADERS = ['NO.', '名称', '仕様', '数量', '単位', '単価', '金額', '備考']

type ExportRow = {
  name1?: string | null; name2?: string | null
  spec1?: string | null; spec2?: string | null
  quantity?: string | number | null
  unit?: string | null
  unit_price?: string | number | null
  amount?: number | null
  note1?: string | null; note2?: string | null
}
type ExportSection = {
  name: string; rows: ExportRow[]
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

const thin = { style: 'thin' as ExcelJS.BorderStyle }

type BorderPos = 'upper' | 'lower' | 'box'

const applyCell = (
  cell: ExcelJS.Cell,
  value: ExcelJS.CellValue,
  opts: {
    bold?: boolean; size?: number; numFmt?: string
    align?: 'left' | 'center' | 'right'
    fill?: string; border?: BorderPos
  } = {}
) => {
  cell.value = value
  cell.font = { name: FONT, size: opts.size ?? SIZE_DETAIL, bold: !!opts.bold }
  if (opts.numFmt) cell.numFmt = opts.numFmt
  if (opts.align)  cell.alignment = { horizontal: opts.align, vertical: 'middle' }
  if (opts.fill)   cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } }
  switch (opts.border) {
    case 'upper': cell.border = { top: thin, left: thin, right: thin };                    break
    case 'lower': cell.border = { bottom: thin, left: thin, right: thin };                 break
    case 'box':   cell.border = { top: thin, bottom: thin, left: thin, right: thin };      break
  }
}

// 行全体に経費・合計スタイルを一括適用
const applyRowStyle = (
  row: ExcelJS.Row,
  bold: boolean,
  fill: string
) => {
  row.height = HEIGHT_DETAIL
  for (let c = 1; c <= 8; c++) {
    const cell = row.getCell(c)
    cell.font   = { name: FONT, size: SIZE_DETAIL, bold }
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    cell.border = { top: thin, bottom: thin, left: thin, right: thin }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body     = (await req.json()) as ExportBody
    const sections = body?.sections ?? []

    if (sections.length === 0) {
      return NextResponse.json({ error: '明細データがありません' }, { status: 400 })
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = 'KJM'
    wb.created = new Date()

    // シート名の重複・禁止文字対策
    const usedNames = new Set<string>()
    const safeSheetName = (raw: string) => {
      let n = (raw || 'シート').replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'シート'
      const base = n; let i = 2
      while (usedNames.has(n)) { const sfx = `_${i++}`; n = base.slice(0, 31 - sfx.length) + sfx }
      usedNames.add(n); return n
    }

    // ─── サマリーシート（先頭）───────────────────────────────
    const summary = wb.addWorksheet(safeSheetName('建築工事計'))
    summary.getColumn(1).width = 30
    summary.getColumn(2).width = 16

    const sTitle = summary.getRow(1)
    sTitle.height = HEIGHT_TITLE
    ;['工事区分', '金額'].forEach((h, i) => {
      applyCell(sTitle.getCell(i + 1), h, {
        bold: true, size: SIZE_TITLE, align: 'center',
        fill: FILL_HEADER, border: 'box'
      })
    })

    let sr = 2; let grand = 0
    for (const s of sections) {
      const t  = toNum(s.sectionTotal) ?? 0
      const sr_row = summary.getRow(sr)
      sr_row.height = HEIGHT_DETAIL
      applyCell(sr_row.getCell(1), s.name ?? '', { size: SIZE_TITLE, border: 'box' })
      applyCell(sr_row.getCell(2), t, { size: SIZE_TITLE, numFmt: NUM_FMT, align: 'right', border: 'box' })
      grand += t; sr++
    }
    const sGrand = summary.getRow(sr)
    sGrand.height = HEIGHT_DETAIL
    applyCell(sGrand.getCell(1), '建築工事の計', { size: SIZE_TITLE, bold: true, fill: FILL_TOTAL, border: 'box' })
    applyCell(sGrand.getCell(2), grand,           { size: SIZE_TITLE, bold: true, numFmt: NUM_FMT, align: 'right', fill: FILL_TOTAL, border: 'box' })

    // ─── 工事区分ごとのシート ──────────────────────────────────
    for (const section of sections) {
      const ws = wb.addWorksheet(safeSheetName(section.name))
      COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })

      // タイトル行
      const titleRow = ws.getRow(1)
      titleRow.height = HEIGHT_TITLE
      HEADERS.forEach((h, i) => {
        applyCell(titleRow.getCell(i + 1), h, {
          bold: true, size: SIZE_TITLE, align: 'center',
          fill: FILL_HEADER, border: 'box'
        })
      })

      let r          = 2
      let itemNo     = 1
      const firstRow = r

      for (const row of section.rows ?? []) {
        const name1  = (row.name1 ?? '').trim()
        const name2  = (row.name2 ?? '').trim()
        const spec1  = (row.spec1 ?? '').trim()
        const spec2  = (row.spec2 ?? '').trim()
        const note1  = (row.note1 ?? '').trim()
        const note2  = (row.note2 ?? '').trim()
        const qty    = toNum(row.quantity)
        const price  = toNum(row.unit_price)
        const amount = toNum(row.amount)

        // 完全空行はスキップ
        if (!name1 && !name2 && !spec1 && !amount) continue

        const has2Name = !!name2
        const has2Spec = !!spec2
        const has2Note = !!note2

        // ── 上段 ────────────────────────────────────────────────
        // 数量・単価・金額は上段に出さない
        // 名称・仕様・備考は「2段ある場合は上段に1行目 / 1段のみなら上段は空白」
        const upper = ws.getRow(r)
        upper.height = HEIGHT_DETAIL

        applyCell(upper.getCell(1), '',                          { border: 'upper' })
        applyCell(upper.getCell(2), has2Name ? name1 : '',       { border: 'upper' })
        applyCell(upper.getCell(3), has2Spec ? spec1 : '',       { border: 'upper' })
        applyCell(upper.getCell(4), '',                          { border: 'upper' })
        applyCell(upper.getCell(5), '',                          { border: 'upper' })
        applyCell(upper.getCell(6), '',                          { border: 'upper' })
        applyCell(upper.getCell(7), '',                          { border: 'upper' })
        applyCell(upper.getCell(8), has2Note ? note1 : '',       { border: 'upper' })
        r++

        // ── 下段 ────────────────────────────────────────────────
        // NO. / name2orname1 / spec2orspec1 / 数量 / 単位 / 単価 / 金額 / note2ornote1
        const lower = ws.getRow(r)
        lower.height = HEIGHT_DETAIL

        applyCell(lower.getCell(1), itemNo,                       { align: 'center', border: 'lower' })
        applyCell(lower.getCell(2), has2Name ? name2 : name1,     { border: 'lower' })
        applyCell(lower.getCell(3), has2Spec ? spec2 : spec1,     { border: 'lower' })

        if (qty !== null) {
          applyCell(lower.getCell(4), qty,   { numFmt: QTY_FMT, align: 'right', border: 'lower' })
        } else {
          applyCell(lower.getCell(4), '',    { border: 'lower' })
        }
        applyCell(lower.getCell(5), row.unit ?? '', { align: 'center', border: 'lower' })

        if (price !== null) {
          applyCell(lower.getCell(6), price,  { numFmt: NUM_FMT, align: 'right', border: 'lower' })
        } else {
          applyCell(lower.getCell(6), '',     { border: 'lower' })
        }
        if (amount !== null) {
          applyCell(lower.getCell(7), amount, { numFmt: NUM_FMT, align: 'right', border: 'lower' })
        } else {
          applyCell(lower.getCell(7), '',     { border: 'lower' })
        }
        applyCell(lower.getCell(8), has2Note ? note2 : note1, { border: 'lower' })

        r++
        itemNo++
      }

      // 小計行
      const subRow = ws.getRow(r)
      applyRowStyle(subRow, true, FILL_EXPENSE)
      subRow.getCell(2).value = '小計'
      const subG = subRow.getCell(7)
      if (r - 1 >= firstRow) {
        subG.value  = { formula: `SUM(G${firstRow}:G${r - 1})` }
      } else {
        subG.value  = 0
      }
      subG.numFmt    = NUM_FMT
      subG.alignment = { horizontal: 'right' }
      r++

      // 経費行
      const expenses: [string, number | null | undefined][] = [
        ['仮設工事費', section.keihi],
        ['運搬費',     section.unban],
        ['夜間割増費', section.night],
        ['現場経費',   section.genba],
      ]
      for (const [label, val] of expenses) {
        const expRow = ws.getRow(r)
        applyRowStyle(expRow, false, FILL_EXPENSE)
        expRow.getCell(2).value = label
        const gc = expRow.getCell(7)
        gc.value     = toNum(val) ?? 0
        gc.numFmt    = NUM_FMT
        gc.alignment = { horizontal: 'right' }
        r++
      }

      // 工事区分合計行
      const totRow = ws.getRow(r)
      applyRowStyle(totRow, true, FILL_TOTAL)
      totRow.getCell(2).value = `${section.name}の計`
      const tc = totRow.getCell(7)
      tc.value     = toNum(section.sectionTotal) ?? 0
      tc.numFmt    = NUM_FMT
      tc.alignment = { horizontal: 'right' }
    }

    // ─── バッファ書き出し ─────────────────────────────────────
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
