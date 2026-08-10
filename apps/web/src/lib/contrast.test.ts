import { describe, expect, it } from 'vitest'
import { contrastRatio, relativeLuminance } from './contrast.js'

describe('relativeLuminance', () => {
  it('bottoms out at black and tops out at white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('weights green above red above blue, as the eye does', () => {
    const red = relativeLuminance('#ff0000')
    const green = relativeLuminance('#00ff00')
    const blue = relativeLuminance('#0000ff')
    expect(green).toBeGreaterThan(red)
    expect(red).toBeGreaterThan(blue)
  })

  it('accepts a short hex', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#ffffff'), 6)
  })
})

describe('contrastRatio', () => {
  it('is 21 for black against white, the maximum the formula can produce', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2)
  })

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio('#1e9e4a', '#1e9e4a')).toBeCloseTo(1, 6)
  })

  it('does not care which colour is the ink and which is the ground', () => {
    expect(contrastRatio('#14100e', '#f0b310')).toBeCloseTo(contrastRatio('#f0b310', '#14100e'), 6)
  })
})
