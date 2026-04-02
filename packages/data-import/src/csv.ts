import Papa from 'papaparse'

const normalizeValue = (value: unknown): string => {
  const raw = value === null || value === undefined ? '' : String(value)
  const trimmed = raw.trim()

  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"')
  }

  return trimmed
}

export function parseCsv(csv: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, unknown>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => (header ?? '').trim(),
  })
  const data = result.data ?? []
  const errors = result.errors ?? []

  if (errors.length) {
    const message = errors.map((error: Papa.ParseError) => error.message).join('; ')
    throw new Error(`Failed to parse CSV: ${message}`)
  }

  return data.map((row: Record<string, unknown>) => {
    const normalized: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = normalizeValue(value)
    }
    return normalized
  })
}
