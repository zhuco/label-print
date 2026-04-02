import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseExcel } from '../excel'

describe('parseExcel', () => {
  const buildWorkbook = () => {
    const rows = [
      ['name', 'age'],
      ['Alice', 30],
      ['Bob', 25],
    ]
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet(rows)
    XLSX.utils.book_append_sheet(workbook, sheet)
    return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  }

  it('reads rows from an ArrayBuffer', () => {
    const buffer = buildWorkbook()
    const result = parseExcel(buffer)

    expect(result).toEqual([
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' },
    ])
  })

  it('supports Uint8Array input', () => {
    const buffer = buildWorkbook()
    const uint8 = new Uint8Array(buffer)
    const result = parseExcel(uint8)

    expect(result).toEqual([
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' },
    ])
  })
})
