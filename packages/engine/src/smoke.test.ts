import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION } from './index.js'

describe('engine package', () => {
  it('exposes its version', () => {
    expect(ENGINE_VERSION).toBe('0.1.0')
  })
})
