import { describe, expect, it } from 'vitest'
import { COLORS, err, ok } from './types.js'

describe('COLORS', () => {
  it('lists the four UNO colours in a stable order', () => {
    expect(COLORS).toEqual(['R', 'G', 'B', 'Y'])
  })
})

describe('Result', () => {
  it('wraps a success', () => {
    expect(ok(3)).toEqual({ okay: true, value: 3 })
  })

  it('wraps a failure', () => {
    expect(err('not_your_turn')).toEqual({ okay: false, error: 'not_your_turn' })
  })
})
