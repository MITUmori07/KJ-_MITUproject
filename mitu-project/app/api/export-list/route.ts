// ============================================================
// ディレクトリ: mitu-project/app/api/export-list/
// ファイル名: route.ts
// バージョン: V1.2.1
// 作成: 2026/05/27
// 更新: V1.2.1 fix: thin罫線の型注釈エラー解消（as const）
//       V1.2.0 fix: 列幅/行高を実数値に / NO.右寄せ9pt / 小計・経費・合計を全2段化
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export const runtime = 'nodejs'

// フォント（表示されない場合は 'MS PGothic' に差し替え）
const FONT        = 'ＭＳ Ｐゴシック'
const SIZE_TITLE  = 9   // タイトル行
const SIZE_DETAIL = 11  // 明細
const SIZE_NO     = 9   // NO.

const HEIGHT_TITLE  = 25.5
const HEIGHT_DETAIL = 12.75   // 1段あたり（固定）

// 列幅 A〜H（Excel列幅単位）
const COL_WIDTHS = [4.00, 24.00, 30.00, 10.00, 4.50, 10.88, 12.00, 12.00]

const NUM_FMT = '#,##0'
const QTY_FMT = '0.0'

const FILL_HEADER  = 'FFD9D9D9'
const FILL_EXPENSE = 'FFF2F2F2'
const FILL_TOTAL   = 'FFE2EFDA'

const HEADERS = ['No.', '名称', '仕様', '数量', '単位', '単価', '金額', '備考']

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

const thin = { style: 'thin' as const }
// 上段 = 上＋左右 / 下段 = 下＋左右（中間に横線なし）
const BORDER_UPPER: Partial<ExcelJS.Borders> = { top: thin, left: thin, right: thin }
const BORDER_LOWER: Partial<ExcelJS.Borders> = { bottom: thin, left: thin, right: thin }

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
    const sHead = summary.getRow(1); sHead.height = HEIGHT_TITLE
    ;['工事区分', '金額'].forEach((h, i) => {
      const c = sHead.getCell(i + 1)
      c.value = h
      c.font = { name: FONT, size: SIZE_TITLE, bold: true }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_HEADER } }
      c.border = { top: thin, bottom: thin, left: thin, right: thin }
    })
    let sr = 2; let grand = 0
    for (const s of sections) {
      const t = toNum(s.sectionTotal) ?? 0
      const row = summary.getRow(sr); row.height = HEIGHT_DETAIL
      const cName = row.getCell(1); cName.value = s.name ?? ''
      cName.font = { name: FONT, size: SIZE_DETAIL }
      cName.border = { top: thin, bottom: thin, left: thin, right: thin }
      const cVal = row.getCell(2); cVal.value = t
      cVal.font = { name: FONT, size: SIZE_DETAIL }; cVal.numFmt = NUM_FMT
      cVal.alignment = { horizontal: 'right' }
      cVal.border = { top: thin, bottom: thin, left: thin, right: thin }
      grand += t; sr++
    }
    const gRow = summary.getRow(sr); gRow.height = HEIGHT_DETAIL
    const g1 = gRow.getCell(1); g1.value = '建築工事の計'
    g1.font = { name: FONT, size: SIZE_DETAIL, bold: true }
    g1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_TOTAL } }
    g1.border = { top: thin, bottom: thin, left: thin, right: thin }
    const g2 = gRow.getCell(2); g2.value = grand
    g2.font = { name: FONT, size: SIZE_DETAIL, bold: true }; g2.numFmt = NUM_FMT
    g2.alignment = { horizontal: 'right' }
    g2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_TOTAL } }
    g2.border = { top: thin, bottom: thin, left: thin, right: thin }

    // ─── 工事区分ごとのシート ──────────────────────────────────
    for (const section of sections) {
      const ws = wb.addWorksheet(safeSheetName(section.name))
      COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })

      // タイトル行（MS Pゴシック 9B・センター）
      const tRow = ws.getRow(1); tRow.height = HEIGHT_TITLE
      HEADERS.forEach((h, i) => {
        const c = tRow.getCell(i + 1)
        c.value = h
        c.font = { name: FONT, size: SIZE_TITLE, bold: true }
        c.alignment = { horizontal: 'center', vertical: 'middle' }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_HEADER } }
        c.border = { top: thin, bottom: thin, left: thin, right: thin }
      })

      let r = 2
      let itemNo = 1
      const firstRow = r

      // 上段を書く共通処理
      const writeUpper = (vals: (ExcelJS.CellValue)[]) => {
        const row = ws.getRow(r); row.height = HEIGHT_DETAIL
        for (let c = 1; c <= 8; c++) {
          const cell = row.getCell(c)
          cell.value = vals[c - 1] ?? ''
          cell.font = { name: FONT, size: SIZE_DETAIL }
          cell.border = BORDER_UPPER
        }
        r++
        return row
      }

      for (const row of section.rows ?? []) {
        const name1 = (row.name1 ?? '').trim()
        const name2 = (row.name2 ?? '').trim()
        const spec1 = (row.spec1 ?? '').trim()
        const spec2 = (row.spec2 ?? '').trim()
        const note1 = (row.note1 ?? '').trim()
        const note2 = (row.note2 ?? '').trim()
        const qty   = toNum(row.quantity)
        const price = toNum(row.unit_price)
        const amount = toNum(row.amount)

        if (!name1 && !name2 && !spec1 && !amount) continue

        const has2Name = !!name2
        const has2Spec = !!spec2
        const has2Note = !!note2

        // ── 上段（名称・仕様・備考の1段目。1段のみなら空白）──
        writeUpper([
          '',                          // A
          has2Name ? name1 : '',       // B 名称1段目
          has2Spec ? spec1 : '',       // C 仕様1段目
          '', '', '', '',              // D〜G（数量〜金額は下段のみ）
          has2Note ? note1 : '',       // H 備考1段目
        ])

        // ── 下段（NO.・数量〜金額・名称等の最終段）──
        const lower = ws.getRow(r); lower.height = HEIGHT_DETAIL
        for (let c = 1; c <= 8; c++) {
          lower.getCell(c).font = { name: FONT, size: SIZE_DETAIL }
          lower.getCell(c).border = BORDER_LOWER
        }
        // A: No.（数値・右寄せ・9pt）
        const cNo = lower.getCell(1)
        cNo.value = itemNo
        cNo.font = { name: FONT, size: SIZE_NO }
        cNo.alignment = { horizontal: 'right', vertical: 'middle' }
        // B/C/H: 2段なら2段目・1段なら本体
        lower.getCell(2).value = has2Name ? name2 : name1
        lower.getCell(3).value = has2Spec ? spec2 : spec1
        lower.getCell(8).value = has2Note ? note2 : note1
        // D 数量
        if (qty !== null) {
          lower.getCell(4).value = qty
          lower.getCell(4).numFmt = QTY_FMT
          lower.getCell(4).alignment = { horizontal: 'right' }
        }
        // E 単位
        lower.getCell(5).value = row.unit ?? ''
        lower.getCell(5).alignment = { horizontal: 'center' }
        // F 単価
        if (price !== null) {
          lower.getCell(6).value = price
          lower.getCell(6).numFmt = NUM_FMT
          lower.getCell(6).alignment = { horizontal: 'right' }
        }
        // G 金額
        if (amount !== null) {
          lower.getCell(7).value = amount
          lower.getCell(7).numFmt = NUM_FMT
          lower.getCell(7).alignment = { horizontal: 'right' }
        }
        r++
        itemNo++
      }
      const lastDataRow = r - 1

      // ── 小計・経費・合計：すべて2段（上段空白・下段に表記）──
      const writeSummary2 = (
        label: string,
        value: ExcelJS.CellValue,
        fill: string,
        bold: boolean,
        formula?: string
      ) => {
        // 上段（空白）
        const up = ws.getRow(r); up.height = HEIGHT_DETAIL
        for (let c = 1; c <= 8; c++) {
          const cell = up.getCell(c)
          cell.font = { name: FONT, size: SIZE_DETAIL, bold }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
          cell.border = BORDER_UPPER
        }
        r++
        // 下段（表記）
        const lo = ws.getRow(r); lo.height = HEIGHT_DETAIL
        for (let c = 1; c <= 8; c++) {
          const cell = lo.getCell(c)
          cell.font = { name: FONT, size: SIZE_DETAIL, bold }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
          cell.border = BORDER_LOWER
        }
        lo.getCell(2).value = label
        const g = lo.getCell(7)
        g.value = formula ? { formula } : value
        g.numFmt = NUM_FMT
        g.alignment = { horizontal: 'right' }
        r++
      }

      // 小計（SUM式）
      writeSummary2(
        '小計', 0, FILL_EXPENSE, true,
        lastDataRow >= firstRow ? `SUM(G${firstRow}:G${lastDataRow})` : undefined
      )
      // 経費
      writeSummary2('仮設工事費', toNum(section.keihi) ?? 0, FILL_EXPENSE, false)
      writeSummary2('運搬費',     toNum(section.unban) ?? 0, FILL_EXPENSE, false)
      writeSummary2('夜間割増費', toNum(section.night) ?? 0, FILL_EXPENSE, false)
      writeSummary2('現場経費',   toNum(section.genba) ?? 0, FILL_EXPENSE, false)
      // 工事区分合計
      writeSummary2(`${section.name}の計`, toNum(section.sectionTotal) ?? 0, FILL_TOTAL, true)
    }

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
