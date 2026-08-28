import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useShoutUno } from './useShoutUno.js'
import type { ShoutAvailability, ShoutListener } from '../lib/voice/shout-listener.js'

type Props = { armed: boolean; prewarm: boolean; enabled: boolean; cloudAllowed: boolean }

/** A listener whose "heard it" can be fired by the test. */
const fakeListener = () => {
  let shout: () => void = () => undefined
  const listener: ShoutListener = { start: vi.fn(), stop: vi.fn(), destroy: vi.fn() }
  const create = vi.fn((options: { onShout: () => void }) => {
    shout = options.onShout
    return listener
  })
  return { create, listener, hear: () => shout() }
}

const setup = (initial: Partial<Props> = {}, availability: ShoutAvailability = 'local') => {
  const onCall = vi.fn()
  const { create, listener, hear } = fakeListener()
  const probe = vi.fn(() => Promise.resolve(availability))
  const props: Props = {
    armed: false,
    prewarm: true,
    enabled: true,
    cloudAllowed: false,
    ...initial,
  }
  const view = renderHook(
    (current: Props) =>
      useShoutUno({
        ...current,
        locale: 'fr',
        onCall,
        create,
        probe,
      }),
    { initialProps: props },
  )
  return { onCall, create, listener, hear, view, props }
}

describe('useShoutUno', () => {
  it('calls when the word is heard while the call is legal', async () => {
    const { onCall, hear, view } = setup({ armed: true })
    await waitFor(() => expect(view.result.current.availability).toBe('local'))
    hear()
    expect(onCall).toHaveBeenCalledTimes(1)
  })

  it('stays quiet while the call is not legal, however clearly it is shouted', async () => {
    const { onCall, hear, view } = setup({ armed: false })
    await waitFor(() => expect(view.result.current.availability).toBe('local'))
    hear()
    expect(onCall).not.toHaveBeenCalled()
  })

  it('calls once per window, not once per syllable', async () => {
    const { onCall, hear, view } = setup({ armed: true })
    await waitFor(() => expect(view.result.current.availability).toBe('local'))
    hear()
    hear()
    hear()
    expect(onCall).toHaveBeenCalledTimes(1)
  })

  it('arms again for the next time the call becomes legal', async () => {
    const { onCall, hear, view, props } = setup({ armed: true })
    await waitFor(() => expect(view.result.current.availability).toBe('local'))
    hear()
    view.rerender({ ...props, armed: false })
    view.rerender({ ...props, armed: true })
    hear()
    expect(onCall).toHaveBeenCalledTimes(2)
  })

  it('listens only while the hand is short enough to matter', async () => {
    const { listener, view, props } = setup({ prewarm: false })
    await waitFor(() => expect(view.result.current.availability).toBe('local'))
    expect(listener.start).not.toHaveBeenCalled()
    view.rerender({ ...props, prewarm: true })
    await waitFor(() => expect(listener.start).toHaveBeenCalled())
  })

  it('stops listening when voice is left or the microphone is muted', async () => {
    const { listener, view, props } = setup({ prewarm: true, enabled: true })
    await waitFor(() => expect(listener.start).toHaveBeenCalled())
    view.rerender({ ...props, enabled: false })
    await waitFor(() => expect(listener.destroy).toHaveBeenCalled())
  })

  it('never opens a cloud recogniser without consent', async () => {
    const { create, view } = setup({ cloudAllowed: false }, 'cloud')
    await waitFor(() => expect(view.result.current.availability).toBe('cloud'))
    expect(create).not.toHaveBeenCalled()
  })

  it('opens a cloud recogniser once consent is given', async () => {
    const { create, view, props } = setup({ cloudAllowed: false }, 'cloud')
    await waitFor(() => expect(view.result.current.availability).toBe('cloud'))
    view.rerender({ ...props, cloudAllowed: true })
    await waitFor(() => expect(create).toHaveBeenCalled())
  })

  it('opens nothing at all on a browser that cannot listen', async () => {
    const { create, view } = setup({}, 'unsupported')
    await waitFor(() => expect(view.result.current.availability).toBe('unsupported'))
    expect(create).not.toHaveBeenCalled()
  })
})
