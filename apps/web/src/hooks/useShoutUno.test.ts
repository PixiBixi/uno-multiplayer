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

describe('useShoutUno while a language pack downloads', () => {
  it('opens no listener while the probe answers downloading', async () => {
    const { create, view } = setup({ armed: true }, 'downloading')
    await waitFor(() => expect(view.result.current.availability).toBe('downloading'))
    expect(create).not.toHaveBeenCalled()
  })

  it('reaches local on its own once the pack lands, with no reload and no user action', async () => {
    vi.useFakeTimers()
    const onCall = vi.fn()
    const { create, hear } = fakeListener()
    let calls = 0
    // Two rounds of 'downloading' in a row before 'local': a single retry would
    // not be enough to prove the poll survives an unchanged availability value.
    const probe = vi.fn((): Promise<ShoutAvailability> =>
      Promise.resolve(calls++ < 2 ? 'downloading' : 'local'),
    )
    const view = renderHook(() =>
      useShoutUno({
        armed: true,
        prewarm: true,
        enabled: true,
        cloudAllowed: false,
        locale: 'fr',
        onCall,
        create,
        probe,
      }),
    )
    await vi.waitFor(() => expect(view.result.current.availability).toBe('downloading'))
    expect(create).not.toHaveBeenCalled()

    // First poll: still 'downloading', same value as before.
    await vi.advanceTimersByTimeAsync(2000)
    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(2))
    expect(view.result.current.availability).toBe('downloading')
    expect(create).not.toHaveBeenCalled()

    // Second poll: now resolves to 'local'.
    await vi.advanceTimersByTimeAsync(2000)
    await vi.waitFor(() => expect(view.result.current.availability).toBe('local'))
    expect(create).toHaveBeenCalled()

    hear()
    expect(onCall).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('stops polling once it reaches local, so it does not keep asking Chrome forever', async () => {
    vi.useFakeTimers()
    let calls = 0
    const probe = vi.fn((): Promise<ShoutAvailability> =>
      Promise.resolve(calls++ === 0 ? 'downloading' : 'local'),
    )
    const view = renderHook(() =>
      useShoutUno({
        armed: false,
        prewarm: true,
        enabled: true,
        cloudAllowed: false,
        locale: 'fr',
        onCall: vi.fn(),
        create: fakeListener().create,
        probe,
      }),
    )
    await vi.waitFor(() => expect(view.result.current.availability).toBe('downloading'))
    await vi.advanceTimersByTimeAsync(2000)
    await vi.waitFor(() => expect(view.result.current.availability).toBe('local'))
    const callsAtLocal = probe.mock.calls.length

    // Ten separate advances rather than one big jump: each `await` lets the
    // fake-timer engine flush a real event-loop tick, which is what actually
    // reveals a poll that a broken guard would keep rescheduling.
    for (let round = 0; round < 10; round += 1) {
      await vi.advanceTimersByTimeAsync(2000)
    }
    expect(probe.mock.calls.length).toBe(callsAtLocal)
    vi.useRealTimers()
  })
})
