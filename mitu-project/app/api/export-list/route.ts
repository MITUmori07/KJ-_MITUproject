// ============================================================
// ディレクトリ: mitu-project/app/api/export-list/
// ファイル名: route.ts
// バージョン: V1.5.0
// 作成: 2026/05/27
// 更新: V1.5.0 feat: 1タブ連続出力 / 全工事区分を通しでNo.1〜3000 /
//                    各区分=区分名→空白→明細→区切り空白 / 経費は最後に全区分合算4行 /
//                    サマリーシート廃止
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

const MAX_NO = 3000   // No.1〜3000まで固定で番号を振る

const NUM_FMT = '#,##0'
const QTY_FMT = '0.0'

const FILL_HEADER  = 'FFD9D9D9'
const FILL_EXPENSE = 'FFF2F2F2'

const HEADERS = ['No', '名称', '仕様', '数量', '単位', '単価', '金額', '備考']

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

// 1つのNo.スロットに入る内容
type Entry =
  | { kind: 'sectionName'; name: string }
  | { kind: 'blank' }
  | { kind: 'item'; item: ExportRow }
  | { kind: 'expense'; label: string; amount: number }

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

    const sheetName = (body.title || '明細一覧').replace(/[\\/?*[\]:]/g, '').slice(0, 31) || '明細一覧'
    const ws = wb.addWorksheet(sheetName)
    COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })

    // ─── タイトル行 ───────────────────────────────────────────
    const tRow = ws.getRow(1); tRow.height = HEIGHT_TITLE
    HEADERS.forEach((h, i) => {
      const c = tRow.getCell(i + 1)
      c.value = h
      c.font = { name: FONT, size: SIZE_TITLE, bold: true }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_HEADER } }
      c.border = { top: thin, bottom: thin, left: thin, right: thin }
    })

    // ─── 全工事区分を1本のEntry配列に展開 ──────────────────────
    const entries: Entry[] = []
    let totalKeihi = 0, totalUnban = 0, totalNight = 0, totalGenba = 0

    for (const section of sections) {
      // 有効品目だけ抽出（空行除外）
      const items = (section.rows ?? []).filter(row => {
        const name1 = (row.name1 ?? '').trim()
        const name2 = (row.name2 ?? '').trim()
        const spec1 = (row.spec1 ?? '').trim()
        const amount = toNum(row.amount)
        return !!(name1 || name2 || spec1 || amount)
      })

      entries.push({ kind: 'sectionName', name: section.name })  // 区分名
      entries.push({ kind: 'blank' })                            // 区分名直後の空白
      for (const item of items) entries.push({ kind: 'item', item })
      entries.push({ kind: 'blank' })                            // 区切り空白

      totalKeihi += toNum(section.keihi) ?? 0
      totalUnban += toNum(section.unban) ?? 0
      totalNight += toNum(section.night) ?? 0
      totalGenba += toNum(section.genba) ?? 0
    }

    // 経費（全区分合算・最後にまとめて）
    entries.push({ kind: 'expense', label: '仮設工事費', amount: totalKeihi })
    entries.push({ kind: 'expense', label: '運搬費',     amount: totalUnban })
    entries.push({ kind: 'expense', label: '夜間割増費', amount: totalNight })
    entries.push({ kind: 'expense', label: '現場経費',   amount: totalGenba })

    // ─── 書き込み用ヘルパ ────────────────────────────────────
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

      up.getCell(2).value = has2Name ? name1 : ''
      up.getCell(3).value = has2Spec ? spec1 : ''
      up.getCell(8).value = has2Note ? note1 : ''
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

    const fillExpense = (lo: ExcelJS.Row, label: string, amount: number) => {
      lo.getCell(2).value = label
      lo.getCell(4).value = 1.0; lo.getCell(4).numFmt = QTY_FMT
      lo.getCell(4).alignment = { horizontal: 'right' }
      lo.getCell(5).value = '式'; lo.getCell(5).alignment = { horizontal: 'center' }
      lo.getCell(6).value = amount; lo.getCell(6).numFmt = NUM_FMT
      lo.getCell(6).alignment = { horizontal: 'right' }
      lo.getCell(7).value = amount; lo.getCell(7).numFmt = NUM_FMT
      lo.getCell(7).alignment = { horizontal: 'right' }
    }

    // ─── No.1〜3000 を連続配置 ───────────────────────────────
    let r = 2
    for (let no = 1; no <= MAX_NO; no++) {
      const up = ws.getRow(r); up.height = HEIGHT_DETAIL
      for (let c = 1; c <= 8; c++) {
        up.getCell(c).font = { name: FONT, size: SIZE_DETAIL }
        up.getCell(c).border = BORDER_UPPER
      }
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

      const entry = entries[no - 1]
      if (entry) {
        if (entry.kind === 'sectionName') {
          const cName = up.getCell(2)
          cName.value = entry.name
          cName.font = { name: FONT, size: SIZE_DETAIL, bold: true }
        } else if (entry.kind === 'item') {
          fillItem(up, lo, entry.item)
        } else if (entry.kind === 'expense') {
          for (let c = 1; c <= 8; c++) {
            up.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_EXPENSE } }
            lo.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_EXPENSE } }
          }
          fillExpense(lo, entry.label, entry.amount)
        }
        // blank は番号だけ（何もしない）
      }
      // entriesを超えた分も番号だけの空白行
      r += 2
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
