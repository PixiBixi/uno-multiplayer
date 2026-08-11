import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * The one guard in this hook worth a test of its own: a second Create while the first is
 * unanswered must not open a second table.
 *
 * A double tap is easy to do — the acknowledgement is a round trip away, 300 ms on a
 * phone — and it used to cost the server a room it then held for the life of the process,
 * because the socket abandoned the first table without releasing its seat. The server no
 * longer leaks that room, so this is about not asking for it at all.
 *
 * The socket is a stub because the claim is about how many times the client emits, and
 * nothing else here needs a server. The ack is held rather than answered so the in-flight
 * window can be inspected, which is the whole point: an implementation that cleared the
 * flag synchronously would pass a test that answered immediately.
 */

type Ack = (result: { ok: boolean; error?: string }) => void

const emitted: { event: string; ack: Ack }[] = []

const socket = {
  emit: (event: string, _payload: unknown, ack: Ack) => {
    emitted.push({ event, ack })
  },
  on: () => socket,
  off: () => socket,
  disconnect: () => socket,
  connected: true,
  id: 'stub',
}

vi.mock('socket.io-client', () => ({ io: () => socket }))

// Imported after the mock so the hook picks up the stub.
const { useGameSocket } = await import('./useGameSocket.js')

const creates = () => emitted.filter((entry) => entry.event === 'room:create')

beforeEach(() => {
  emitted.length = 0
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
      creates()[0]?.ack({ ok: false, error: 'rate_limited' })
    })
    act(() => {
      result.current.actions.createRoom('Ana')
    })

    expect(creates()).toHaveLength(2)
  })
})
