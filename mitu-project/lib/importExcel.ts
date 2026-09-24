// ============================================================
// ディレクトリ: mitu-project/lib/
// ファイル名: importExcel.ts
// バージョン: V1.0.0
// 概要: Excel取り込みの「読み取り部分」だけを取り出したファイル。
//       画面（app/import/page.tsx）から呼ぶ。画面と分けてあるので、
//       ここだけを見れば取り込みルールが分かるようにしている。
// 対応している見積書の形:
//   ・工事区分の行 … B列に番号（1,2,3…）またはローマ数字（Ⅰ,Ⅱ,Ⅲ…）、C列に工事区分名
//   ・明細の行     … C:名称 / D:仕様 / E:数量 / F:単位 / G:単価 / H:金額 / I:備考
//   ・小計の行     … C（またはD）が「小計」。ここから下は経費あつかい
//   ・経費の行     … 「仮設費」「現場経費」など
//   ・工事区分の計 … C（またはD）が「計」「◯◯の計」。取り込み前の突合に使う
//   ※「小　　　計」のように全角スペースが入っていても同じものとして読む
// ============================================================

export type SheetRow = Record<string, unknown>

export type PreviewRow = {
  rowNum: number
  work_section: string
  name1: string; name2: string; name3: string
  spec1: string; spec2: string; spec3: string
  quantity: string; unit: string; unit_price: string; amount: number
  rawAmount: number          // 円未満を丸める前の金額（合計の突合に使う）
  note1: string; note2: string; note3: string
  warning: boolean
  warningMsg: string
}

export type SectionMatch = {
  name: string
  excelTotal: number
  calcTotal: number
  matched: boolean
}

export type ParseResult = {
  rows: PreviewRow[]
  excelTotals: Record<string, number>
  sectionFound: boolean   // 工事区分の行が1つでも見つかったか（エラー表示用）
}

const toStr = (v: unknown) => (v === null || v === undefined) ? '' : String(v)

// 空のセルか（未入力は null、または列そのものが無い場合は undefined）
const isEmpty = (v: unknown) => v === null || v === undefined || v === ''

// 比較用に空白（半角・全角）を取り除く。「小　　　計」→「小計」
const squeeze = (v: unknown) => toStr(v).replace(/[\s　]+/g, '')

// B列が工事区分の番号か。1,2,3… / Ⅰ,Ⅱ,Ⅲ…（全角）/ I,II,III（半角）に対応
const ROMAN_ZENKAKU = 'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ'
export const isSectionNo = (v: unknown) => {
  if (typeof v === 'number' && Number.isFinite(v)) return true
  const s = squeeze(v)
  if (!s) return false
  if (/^[0-9０-９]+$/.test(s)) return true
  if ([...s].every(ch => ROMAN_ZENKAKU.includes(ch))) return true
  if (/^[IVXivx]+$/.test(s)) return true
  return false
}

// 工事区分の合計行（「計」「◯◯の計」など）。「小計」はここには含めない
export const isSectionTotal = (v: unknown) => {
  const s = squeeze(v)
  if (!s) return false
  return s === '計' || s.includes('の計') || s.includes('建築工事')
}
export const isSectionTotalRow = (c: unknown, d: unknown) =>
  isSectionTotal(d) || isSectionTotal(c)

// 小計の行
export const isSubtotal = (v: unknown) => squeeze(v) === '小計'

// 「P.2」のようなページ番号
export const isPageNum = (note: unknown) => /^P\.\s*\d+/.test(toStr(note))

// 見出しの行（取り込まない）
export const isHeaderRow = (b: unknown, c: unknown) => {
  if (squeeze(b) === 'No.') return true
  const s = squeeze(c)
  if (!s) return false
  return ['名称', '（内訳）', '(内訳)', 'Ⅰ', 'Ⅱ'].some(h => s.startsWith(h))
}

// 経費の名前ゆれを、アプリ側で使っている名前に合わせる
// （合わせておかないと、history画面の経費欄に金額が出てこない）
const EXPENSE_ALIASES: Record<string, string> = {
  '仮設費': '仮設工事費',
  '仮設工事費': '仮設工事費',
  '運搬費': '運搬費',
  '現場経費': '現場経費',
  '現場雑費': '現場経費',
}
export const normalizeExpenseName = (name: string) =>
  EXPENSE_ALIASES[squeeze(name)] || name

// \n で分割して3段に
export const split3 = (val: unknown): [string, string, string] => {
  const parts = toStr(val).split('\n').map(s => s.trim()).filter(Boolean)
  return [parts[0] || '', parts[1] || '', parts[2] || '']
}

// ------------------------------------------------------------
// シート1枚分のデータを、プレビュー用の明細に変換する
// rows      : XLSX.utils.sheet_to_json(ws, { header:'A' }) の戻り値
// startRow  : rows[0] がExcelの何行目にあたるか（表示する行番号のため）
// ------------------------------------------------------------
export const parseSheetRows = (rows: SheetRow[], startRow = 1): ParseResult => {
  const parsed: PreviewRow[] = []
  const excelTotals: Record<string, number> = {}
  let currentSection = ''
  let afterSubtotal = false
  let sectionFound = false

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {}
    const rowNum = i + startRow
    const b = row['B']
    const c = toStr(row['C']).trim()
    const d = toStr(row['D']).trim()
    const e = row['E']
    const f = toStr(row['F']).trim()
    const g = row['G']
    const h = row['H']
    const ii = toStr(row['I']).trim()

    if (isPageNum(ii) && !c) continue
    if (isHeaderRow(b, c)) continue
    if (!c && !d && isEmpty(e) && isEmpty(g) && isEmpty(h)) continue

    // 工事区分の行（B列に番号かローマ数字、C列に区分名、数量・単価は無し）
    if (isSectionNo(b) && c && isEmpty(e) && isEmpty(g)) {
      sectionFound = true
      currentSection = c
      afterSubtotal = false
      continue
    }

    if (!sectionFound) continue

    // 工事区分の計（取り込み前の突合に使うだけで、明細にはしない）
    if (isSectionTotalRow(c, d) && currentSection && !isEmpty(h)) {
      excelTotals[currentSection] = Math.round(Number(h))
      continue
    }

    // 小計。ここから下は経費あつかいにする
    if ((isSubtotal(c) || isSubtotal(d)) && currentSection && !isSectionTotalRow(c, d)) {
      afterSubtotal = true
      const rawAmount = !isEmpty(h) ? Number(h) : 0
      const amount = Math.round(rawAmount)
      parsed.push({
        rowNum,
        work_section: `経費_${currentSection}`,
        name1: '小計', name2: '', name3: '',
        spec1: '', spec2: '', spec3: '',
        quantity: '1', unit: '式',
        unit_price: String(amount),
        amount, rawAmount,
        note1: '', note2: '', note3: '',
        warning: false, warningMsg: '',
      })
      continue
    }

    // 小計より下（仮設費・現場経費など）
    if (afterSubtotal && currentSection && c) {
      const rawAmount = !isEmpty(h) ? Number(h) : 0
      const amount = Math.round(rawAmount)
      const unitPrice = !isEmpty(g) ? Number(g) : amount
      const [n1, n2, n3] = split3(c)
      const [s1, s2, s3] = split3(d)
      parsed.push({
        rowNum,
        work_section: `経費_${currentSection}`,
        name1: normalizeExpenseName(n1), name2: n2, name3: n3,
        spec1: s1, spec2: s2, spec3: s3,
        quantity: !isEmpty(e) ? String(Number(e)) : '1',
        unit: f || '式',
        unit_price: String(unitPrice),
        amount, rawAmount,
        note1: '', note2: '', note3: '',
        warning: false, warningMsg: '',
      })
      continue
    }

    // ふつうの明細
    if (c || d || !isEmpty(e) || !isEmpty(g)) {
      const [n1, n2, n3] = split3(c)
      const [s1, s2, s3] = split3(d)
      const [o1, o2, o3] = split3(ii)
      const qty = !isEmpty(e) && !isNaN(Number(e)) ? Number(e) : null
      const price = !isEmpty(g) && !isNaN(Number(g)) ? Number(g) : null
      const hVal = !isEmpty(h) && !isNaN(Number(h)) ? Number(h) : null
      const rawAmount = hVal !== null
        ? hVal
        : (qty !== null && price !== null ? qty * price : 0)
      const amount = Math.round(rawAmount)

      // 名称だけの行（【天井関連】など）は見出しなので取り込まない
      const hasContent = !!d || !isEmpty(e) || !isEmpty(g)
      if (!hasContent) continue

      const msgs: string[] = []
      if (!currentSection) msgs.push('工事区分不明')
      if (qty === null) msgs.push('数量なし')

      parsed.push({
        rowNum,
        work_section: currentSection || '不明',
        name1: n1, name2: n2, name3: n3,
        spec1: s1, spec2: s2, spec3: s3,
        quantity: qty !== null ? String(qty) : '',
        unit: f,
        unit_price: price !== null ? String(price) : '',
        amount, rawAmount,
        note1: o1, note2: o2, note3: o3,
        warning: msgs.length > 0,
        warningMsg: msgs.join('・'),
      })
    }
  }

  // 名称が空の行は、同じ工事区分の1つ上の行から名称を引き継ぐ
  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i]
    if (!row.name1 && (row.spec1 || row.quantity || row.unit_price) && !row.work_section.startsWith('経費_')) {
      let prevIdx = i - 1
      while (prevIdx >= 0 && parsed[prevIdx].work_section !== row.work_section) prevIdx--
      if (prevIdx >= 0) {
        parsed[i] = { ...row, name1: parsed[prevIdx].name1, name2: parsed[prevIdx].name2, name3: parsed[prevIdx].name3 }
      }
    }
  }

  return { rows: parsed, excelTotals, sectionFound }
}

// 工事区分ごとに「Excelの計」と「明細から計算した合計」を突き合わせる
export const buildSectionMatches = (
  rows: PreviewRow[],
  excelTotals: Record<string, number>,
): SectionMatch[] => {
  const sections = [...new Set(rows.filter(r => !r.work_section.startsWith('経費_')).map(r => r.work_section))]
  return sections.map(name => {
    const excelTotal = excelTotals[name] ?? null
    // 1行ずつ丸めた金額を足すとExcelと1円ずれることがあるため、
    // 突合は丸める前の金額で合計してから丸める
    const detailTotal = rows.filter(r => r.work_section === name).reduce((sum, r) => sum + r.rawAmount, 0)
    const expenseTotal = rows.filter(r => r.work_section === `経費_${name}` && r.name1 !== '小計').reduce((sum, r) => sum + r.rawAmount, 0)
    const calcTotal = Math.round(detailTotal + expenseTotal)
    return {
      name,
      excelTotal: excelTotal ?? 0,
      calcTotal,
      matched: excelTotal !== null && Math.round(excelTotal) === Math.round(calcTotal),
    }
  })
}
