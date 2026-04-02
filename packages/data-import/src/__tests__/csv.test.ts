import { describe, expect, it } from 'vitest'
import { parseCsv } from '../csv'

describe('parseCsv', () => {
  it('parses CSV with headers and trimming', () => {
    const csv = `name, age, city\n"Jane, A.", 28, "New York"\n"  Bob  ",  35 ,  "Los Angeles"\n\n`
    const result = parseCsv(csv)

    expect(result).toEqual([
      { name: 'Jane, A.', age: '28', city: 'New York' },
      { name: 'Bob', age: '35', city: 'Los Angeles' },
    ])
  })

  it('skips empty rows and keeps headers intact', () => {
    const csv = 'color,code\nred,#f00\n\n'
    const result = parseCsv(csv)

    expect(result).toEqual([{ color: 'red', code: '#f00' }])
  })
})
