import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function POST(req: NextRequest) {
  const { date, building, title, staff, work_type, sections } = await req.json()

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('建築')

  ws.columns = [
    { width: 2.3 }, { width: 2.3 }, { width: 18.8 }, { width: 22.8 },
    { width: 9.3 }, { width: 3.8 }, { width: 10.8 }, { width: 11.8 }, { width: 11.8 }
  ]

  let r = 2

  const h = ws.getRow(r)
  h.getCell(3).value = '名　　　称　・　仕　　　様'
  h.getCell(5).value = '数　量'
  h.getCell(6).value = '単位'
  h.getCell(7).value = '単　価'
  h.getCell(8).value = '金　額'
  h.getCell(9).value = '備　考'
  h.height = 26
  r++

  ws.getRow(r).getCell(2).value = 'Ⅰ'
  ws.getRow(r).getCell(3).value = '建築工事'
  ws.getRow(r).height = 36
  r++

  ws.getRow(r).getCell(3).value = '（内訳）'
  ws.getRow(r).height = 36
  r++
  r++

  sections.forEach((section: any, idx: number) => {
    const subtotal = section.rows.reduce((s: number, row: any) => s + (row.amount || 0), 0)
    const sr = ws.getRow(r)
    sr.getCell(2).value = idx + 1
    sr.getCell(3).value = section.name
    sr.getCell(5).value = 1
    sr.getCell(6).value = '式'
    sr.getCell(8).value = Math.round(subtotal)
    sr.height = 36
    r++
  })

  const grandTotal = sections.reduce((s: number, sec: any) =>
    s + sec.rows.reduce((ss: number, row: any) => ss + (row.amount || 0), 0), 0)

  const tr = ws.getRow(r)
  tr.getCell(4).value = 'Ⅰ- 建築工事の計'
  tr.getCell(8).value = Math.round(grandTotal)
  r += 3

  sections.forEach((section: any, sIdx: number) => {
    const ph = ws.getRow(r)
    ph.getCell(3).value = '名　　　称　・　仕　　　様'
    ph.getCell(5).value = '数　量'
    ph.getCell(6).value = '単位'
    ph.getCell(7).value = '単　価'
    ph.getCell(8).value = '金　額'
    ph.getCell(9).value = '備　考'
    ph.height = 26
    r++

    const sh = ws.getRow(r)
    sh.getCell(2).value = sIdx + 1
    sh.getCell(3).value = section.name
    sh.height = 36
    r++

    section.rows.forEach((row: any) => {
      const name = [row.name1, row.name2, row.name3].filter(Boolean).join('\n')
      const spec = [row.spec1, row.spec2, row.spec3].filter(Boolean).join('\n')
      const note = [row.note1, row.note2, row.note3].filter(Boolean).join('\n')

      const dr = ws.getRow(r)
      dr.getCell(3).value = name
      dr.getCell(3).alignment = { wrapText: true, vertical: 'top' }
      dr.getCell(4).value = spec
      dr.getCell(4).alignment = { wrapText: true, vertical: 'top' }
      dr.getCell(5).value = parseFloat(row.quantity) || null
      dr.getCell(6).value = row.unit || ''
      dr.getCell(7).value = parseFloat(row.unit_price) || null
      dr.getCell(8).value = Math.round((parseFloat(row.quantity) || 0) * (parseFloat(row.unit_price) || 0))
      dr.getCell(9).value = note
      dr.getCell(9).alignment = { wrapText: true, vertical: 'top' }
      dr.height = 36
      r++
    })

    const subtotal = section.rows.reduce((s: number, row: any) => s + (row.amount || 0), 0)
    const stRow = ws.getRow(r)
    stRow.getCell(4).value = '小計'
    stRow.getCell(8).value = Math.round(subtotal)
    r++

    const keihi = Math.round(subtotal * 0.07)
    const unban = Math.round(subtotal * 0.02)
    const genba = Math.round(subtotal * 0.10)

    const expenses: [string, number][] = [
      ['仮設工事費', keihi],
      ['運搬費', unban],
      ['深夜作業割増', 0],
      ['現場経費', genba],
    ]
    expenses.forEach(([name, val]) => {
      const er = ws.getRow(r)
      er.getCell(3).value = name
      er.getCell(5).value = 1
      er.getCell(6).value = '式'
      er.getCell(8).value = val
      er.height = 36
      r++
    })

    const sectionTotal = subtotal + keihi + unban + genba
    const secTotalRow = ws.getRow(r)
    secTotalRow.getCell(4).value = \`\${sIdx + 1}- \${section.name}の計\`
    secTotalRow.getCell(8).value = Math.round(sectionTotal)
    r += 3
  })

  const arrayBuffer = await wb.xlsx.writeBuffer()
  const buffer = Buffer.from(new Uint8Array(arrayBuffer))

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': \`attachment; filename="\${date}_\${building}_\${title}.xlsx"\`
    }
  })
}
