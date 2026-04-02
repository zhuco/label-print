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
  const { data, errors } = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    skipInitialSpace: true,
    transformHeader: (header) => (header ?? '').trim(),
  })

  if (errors.length) {
    const message = errors.map((error) => error.message).join('; ')
    throw new Error(`Failed to parse CSV: ${message}`)
  }

  return data.map((row) => {
    const normalized: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = normalizeValue(value)
    }
    return normalized
  })
}
