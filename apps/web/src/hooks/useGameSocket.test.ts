import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * The one guard in this hook worth a test of its own: a second Create while the first is
 * unanswered must not open a second table.
 *
 * A double tap is easy to do - the acknowledgement is a round trip away, 300 ms on a
 * phone - and it used to cost the server a room it then held for the life of the process,
 * because the socket abandoned the first table without releasing its seat. The server no
 * longer leaks that room, so this is about not asking for it at all.
 *
 * The socket is a stub because the claim is about how many times the client emits, and
 * nothing else here needs a server. The ack is held rather than answered so the in-flight
 * window can be inspected, which is the whole point: an implementation that cleared the
 * flag synchronously would pass a test that answered immediately.
 */

type Result = { ok: boolean; error?: string; seat?: number }
/* Create and join go through `timeout()`, whose ack takes an error first; socket.io only
   calls such an ack when the socket drops, so `timed` is what proves the fix. */
type Ack = (...args: unknown[]) => void

const emitted: { event: string; ack: Ack; timed: boolean }[] = []
const listeners = new Map<string, (...args: unknown[]) => void>()

const socket = {
  emit: (event: string, _payload: unknown, ack: Ack) => {
    emitted.push({ event, ack, timed: false })
  },
  timeout: () => ({
    emit: (event: string, _payload: unknown, ack: Ack) => {
      emitted.push({ event, ack, timed: true })
    },
  }),
  on: (event: string, listener: (...args: unknown[]) => void) => {
    listeners.set(event, listener)
    return socket
  },
  off: () => socket,
  disconnect: () => socket,
  connected: true,
  id: 'stub',
}

vi.mock('socket.io-client', () => ({ io: () => socket }))

// Imported after the mock so the hook picks up the stub.
const { useGameSocket } = await import('./useGameSocket.js')

const creates = () => emitted.filter((entry) => entry.event === 'room:create')

/** Answers a create or join the way a timeout-wrapped ack is answered. */
const answer = (entry: { ack: Ack } | undefined, result: Result) => entry?.ack(null, result)

beforeEach(() => {
  emitted.length = 0
  listeners.clear()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('createRoom', () => {
  it('emits once when the button is tapped twice before the server answers', () => {
    const { result } = renderHook(() => useGameSocket())

    act(() => {
      result.current.actions.createRoom('Ana')
      result.current.actions.createRoom('Ana')
    })

    expect(creates()).toHaveLength(1)
  })

  it('allows another attempt once the server has refused the first', () => {
    const { result } = renderHook(() => useGameSocket())

    act(() => {
      result.current.actions.createRoom('Ana')
    })
    // A refusal has to clear the flag as surely as a success does, or one rate-limited
    // create locks the button for the rest of the session with no way back.
    act(() => {
      answer(creates()[0], { ok: false, error: 'rate_limited' })
    })
    act(() => {
      result.current.actions.createRoom('Ana')
    })

    expect(creates()).toHaveLength(2)
  })

  it('allows another attempt when the socket drops before the answer', () => {
    const { result } = renderHook(() => useGameSocket())

    act(() => {
      result.current.actions.createRoom('Ana')
    })
    expect(creates()[0]?.timed).toBe(true)
    act(() => {
      creates()[0]?.ack(new Error('operation has timed out'))
    })
    act(() => {
      result.current.actions.createRoom('Ana')
    })

    expect(creates()).toHaveLength(2)
  })
})

describe('joinRoom', () => {
  const joins = () => emitted.filter((entry) => entry.event === 'room:join')

  it('emits once when the button is tapped twice before the server answers', () => {
    const { result } = renderHook(() => useGameSocket())

    act(() => {
      result.current.actions.joinRoom('ABC234', 'Ben')
      result.current.actions.joinRoom('ABC234', 'Ben')
    })

    expect(joins()).toHaveLength(1)
  })

  it('allows another attempt once the server has refused the first', () => {
    const { result } = renderHook(() => useGameSocket())

    act(() => {
      result.current.actions.joinRoom('ABC234', 'Ben')
    })
    act(() => {
      answer(joins()[0], { ok: false, error: 'room_full' })
    })
    act(() => {
      result.current.actions.joinRoom('ABC234', 'Ben')
    })

    expect(joins()).toHaveLength(2)
  })

  it('allows another attempt when the socket drops before the answer', () => {
    const { result } = renderHook(() => useGameSocket())

    act(() => {
      result.current.actions.joinRoom('ABC234', 'Ben')
    })
    expect(joins()[0]?.timed).toBe(true)
    act(() => {
      joins()[0]?.ack(new Error('operation has timed out'))
    })
    act(() => {
      result.current.actions.joinRoom('ABC234', 'Ben')
    })

    expect(joins()).toHaveLength(2)
  })
})

describe('rejoin after a restart', () => {
  const rejoins = () => emitted.filter((entry) => entry.event === 'room:rejoin')

  it('returns to the home screen when the room is gone, instead of a frozen table', () => {
    window.history.replaceState(null, '', '/?room=ABC234')
    window.localStorage.setItem('uno.session.ABC234', 'token')
    const { result } = renderHook(() => useGameSocket())

    act(() => listeners.get('connect')?.())
    act(() => rejoins()[0]?.ack({ ok: true, seat: 0 }))
    expect(result.current.state.roomCode).toBe('ABC234')

    // The server restarted: the socket reconnects and the room no longer exists.
    act(() => listeners.get('connect')?.())
    act(() => rejoins()[1]?.ack({ ok: false, error: 'room_not_found' }))

    expect(result.current.state.screen).toBe('home')
    expect(result.current.state.roomCode).toBeNull()
    expect(result.current.state.error).not.toBeNull()
    expect(window.localStorage.getItem('uno.session.ABC234')).toBeNull()
  })
})
