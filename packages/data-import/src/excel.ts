import * as XLSX from 'xlsx'

type ExcelInput = ArrayBuffer | Uint8Array

const toArrayBuffer = (input: ExcelInput): ArrayBuffer => {
  if (input instanceof ArrayBuffer) {
    return input
  }

  return Uint8Array.from(input).buffer
}

export function parseExcel(input: ExcelInput): Record<string, string>[] {
  const buffer = toArrayBuffer(input)
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return []
  }

  const sheet = workbook.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, {
    defval: '',
  })

  return data.map((row) => {
    const normalized: Record<string, string> = {}

    for (const [key, value] of Object.entries(row)) {
      normalized[key] = value === null || value === undefined ? '' : `${value}`
    }

    return normalized
  })
}
