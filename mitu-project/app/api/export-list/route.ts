// ============================================================
// ディレクトリ: mitu-project/app/api/export-list/
// ファイル名: route.ts
// バージョン: V1.3.0
// 作成: 2026/05/27
// 更新: V1.3.0 feat: No.1〜100連番固定 / No.1上段=工事区分名 / 品目はNo.2から /
//                    小計行・○○の計を削除（経費4行は残す）
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export const runtime = 'nodejs'

// フォント（表示されない場合は 'MS PGothic' に差し替え）
const FONT        = 'ＭＳ Ｐゴシック'
const SIZE_TITLE  = 9   // タイトル行
const SIZE_DETAIL = 11  // 明細
const SIZE_NO     = 9   // No.

const HEIGHT_TITLE  = 25.5
const HEIGHT_DETAIL = 12.75   // 1段あたり（固定）

// 列幅 A〜H（Excel列幅単位）
const COL_WIDTHS = [4.00, 24.00, 30.00, 10.00, 4.50, 10.88, 12.00, 12.00]

const MAX_NO = 100   // No.1〜100まで固定で番号を振る

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

      // 有効な品目だけ抽出（空行は除外）
      const items = (section.rows ?? []).filter(row => {
        const name1 = (row.name1 ?? '').trim()
        const name2 = (row.name2 ?? '').trim()
        const spec1 = (row.spec1 ?? '').trim()
        const amount = toNum(row.amount)
        return !!(name1 || name2 || spec1 || amount)
      })

      // 1品目を上段・下段に流し込む
      const fillItem = (up: ExcelJS.Row, lo: ExcelJS.Row, item: ExportRow) => {
        const name1 = (item.name1 ?? '').trim()
        const name2 = (item.name2 ?? '').trim()
        const spec1 = (item.spec1 ?? '').trim()
        const spec2 = (item.spec2 ?? '').trim()
        const note1 = (item.note1 ?? '').trim()
        const note2 = (item.note2 ?? '').trim()
        const qty   = toNum(item.quantity)
        const price = toNum(item.unit_price)
        const amount = toNum(item.amount)
        const has2Name = !!name2, has2Spec = !!spec2, has2Note = !!note2

        // 上段（2段あるときの1段目。1段のみなら空白）
        up.getCell(2).value = has2Name ? name1 : ''
        up.getCell(3).value = has2Spec ? spec1 : ''
        up.getCell(8).value = has2Note ? note1 : ''
        // 下段（最終段の名称・仕様・備考、数量〜金額）
        lo.getCell(2).value = has2Name ? name2 : name1
        lo.getCell(3).value = has2Spec ? spec2 : spec1
        lo.getCell(8).value = has2Note ? note2 : note1
        if (qty !== null) {
          lo.getCell(4).value = qty; lo.getCell(4).numFmt = QTY_FMT
          lo.getCell(4).alignment = { horizontal: 'right' }
        }
        lo.getCell(5).value = item.unit ?? ''
        lo.getCell(5).alignment = { horizontal: 'center' }
        if (price !== null) {
          lo.getCell(6).value = price; lo.getCell(6).numFmt = NUM_FMT
          lo.getCell(6).alignment = { horizontal: 'right' }
        }
        if (amount !== null) {
          lo.getCell(7).value = amount; lo.getCell(7).numFmt = NUM_FMT
          lo.getCell(7).alignment = { horizontal: 'right' }
        }
      }

      // No.1〜100 を固定で配置（1=工事区分名 / 2以降=品目 / 余りは番号だけ）
      let r = 2
      for (let no = 1; no <= MAX_NO; no++) {
        // 上段
        const up = ws.getRow(r); up.height = HEIGHT_DETAIL
        for (let c = 1; c <= 8; c++) {
          up.getCell(c).font = { name: FONT, size: SIZE_DETAIL }
          up.getCell(c).border = BORDER_UPPER
        }
        // 下段
        const lo = ws.getRow(r + 1); lo.height = HEIGHT_DETAIL
        for (let c = 1; c <= 8; c++) {
          lo.getCell(c).font = { name: FONT, size: SIZE_DETAIL }
          lo.getCell(c).border = BORDER_LOWER
        }
        // A列 No.（数値・右寄せ・9pt）
        const cNo = lo.getCell(1)
        cNo.value = no
        cNo.font = { name: FONT, size: SIZE_NO }
        cNo.alignment = { horizontal: 'right', vertical: 'middle' }

        if (no === 1) {
          // No.1 上段 = 工事区分名（太字）、下段は空白
          const cName = up.getCell(2)
          cName.value = section.name
          cName.font = { name: FONT, size: SIZE_DETAIL, bold: true }
        } else {
          // No.2 以降 = 品目（あれば）。なければ番号だけ
          const item = items[no - 2]
          if (item) fillItem(up, lo, item)
        }
        r += 2
      }

      // ─── 経費（仮設・運搬・夜間・現場）各2段。小計・計は無し ───
      const writeExpense2 = (label: string, value: ExcelJS.CellValue) => {
        const up = ws.getRow(r); up.height = HEIGHT_DETAIL
        for (let c = 1; c <= 8; c++) {
          const cell = up.getCell(c)
          cell.font = { name: FONT, size: SIZE_DETAIL }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_EXPENSE } }
          cell.border = BORDER_UPPER
        }
        r++
        const lo = ws.getRow(r); lo.height = HEIGHT_DETAIL
        for (let c = 1; c <= 8; c++) {
          const cell = lo.getCell(c)
          cell.font = { name: FONT, size: SIZE_DETAIL }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_EXPENSE } }
          cell.border = BORDER_LOWER
        }
        lo.getCell(2).value = label
        const g = lo.getCell(7)
        g.value = value; g.numFmt = NUM_FMT
        g.alignment = { horizontal: 'right' }
        r++
      }

      writeExpense2('仮設工事費', toNum(section.keihi) ?? 0)
      writeExpense2('運搬費',     toNum(section.unban) ?? 0)
      writeExpense2('夜間割増費', toNum(section.night) ?? 0)
      writeExpense2('現場経費',   toNum(section.genba) ?? 0)
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
