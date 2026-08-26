import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useShoutUno } from './useShoutUno.js'

const setup = (armed: boolean, speaking: boolean) => {
  const onCall = vi.fn()
  const view = renderHook(({ a, s }) => useShoutUno({ armed: a, speaking: s, onCall }), {
    initialProps: { a: armed, s: speaking },
  })
  return { onCall, view }
}

describe('useShoutUno', () => {
  it('calls when a sound starts while the call is legal', () => {
    const { onCall, view } = setup(true, false)
    expect(onCall).not.toHaveBeenCalled()
    view.rerender({ a: true, s: true })
    expect(onCall).toHaveBeenCalledTimes(1)
  })

  it('calls straight away when the window opens mid-sentence', () => {
    const { onCall, view } = setup(false, true)
    expect(onCall).not.toHaveBeenCalled()
    view.rerender({ a: true, s: true })
    expect(onCall).toHaveBeenCalledTimes(1)
  })

  it('stays quiet while the call is not legal, however loud it gets', () => {
    const { onCall, view } = setup(false, false)
    view.rerender({ a: false, s: true })
    expect(onCall).not.toHaveBeenCalled()
  })

  it('calls once per window, not once per syllable', () => {
    const { onCall, view } = setup(true, false)
    view.rerender({ a: true, s: true })
    view.rerender({ a: true, s: false })
    view.rerender({ a: true, s: true })
    expect(onCall).toHaveBeenCalledTimes(1)
  })

  it('arms again for the next time the call becomes legal', () => {
    const { onCall, view } = setup(true, false)
    view.rerender({ a: true, s: true })
    view.rerender({ a: false, s: false })
    view.rerender({ a: true, s: true })
    expect(onCall).toHaveBeenCalledTimes(2)
  })
})
