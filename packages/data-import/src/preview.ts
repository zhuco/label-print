export interface Preview {
  columns: string[]
  rows: Record<string, string>[]
  missingColumns: string[]
}

export function buildPreview(rows: Record<string, string>[], required: string[] = []): Preview {
  const columns: string[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!key || seen.has(key)) {
        continue
      }

      seen.add(key)
      columns.push(key)
    }
  }

  const rowLimit = rows.slice(0, 50)
  const missingColumns = required.filter((column) => !seen.has(column))

  return {
    columns,
    rows: rowLimit,
    missingColumns,
  }
}
