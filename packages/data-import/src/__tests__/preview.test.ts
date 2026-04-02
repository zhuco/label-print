import { describe, expect, it } from 'vitest'
import { buildPreview } from '../preview'

describe('buildPreview', () => {
  it('collects columns in encountered order and limits rows', () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({
      colA: `${index}`,
      colB: `${index * 2}`,
      ...(index % 3 === 0 ? { extra: `x${index}` } : {}),
    }))

    const preview = buildPreview(rows)

    expect(preview.columns).toEqual(['colA', 'colB', 'extra'])
    expect(preview.rows).toHaveLength(50)
  })

  it('reports missing required fields', () => {
    const rows: Record<string, string>[] = [
      { foo: '1', bar: '2', baz: '' },
      { foo: '', bar: '3', baz: '4' },
    ]
    const preview = buildPreview(rows, ['foo', 'baz', 'missing'])

    expect(preview.missingColumns).toEqual(['missing'])
  })
})
