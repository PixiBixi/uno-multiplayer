import { DEFAULT_MATCH_GOAL, type LobbyView, type PlayerView } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { FEED_LIMIT, gameReducer, initialState } from './game-reducer.js'

const lobby: LobbyView = {
  roomCode: 'ABC234',
  hostSeat: 0,
  seats: [{ seat: 0, name: 'Ana', status: 'active' }],
  canStart: false,
  goal: DEFAULT_MATCH_GOAL,
}

const view = { phase: 'playing', winner: null } as PlayerView

const joined = () => gameReducer(initialState, { type: 'joined', roomCode: 'ABC234', seat: 0 })
const onTable = () => gameReducer(joined(), { type: 'view', view })

describe('gameReducer', () => {
  it('starts on the home screen with nothing joined', () => {
    expect(initialState.screen).toBe('home')
    expect(initialState.view).toBeNull()
    expect(initialState.roomCode).toBeNull()
  })

  it('moves to the lobby when a room is joined', () => {
    const next = joined()
    expect(next.screen).toBe('lobby')
    expect(next.roomCode).toBe('ABC234')
    expect(next.seat).toBe(0)
  })

  it('moves to the table on the first game view', () => {
    const next = onTable()
    expect(next.screen).toBe('table')
    expect(next.view).toBe(view)
  })

  it('keeps the table screen when a game finishes', () => {
    const finished = gameReducer(onTable(), {
      type: 'view',
      view: { ...view, phase: 'finished', winner: 0 },
    })
    expect(finished.screen).toBe('table')
    expect(finished.view?.phase).toBe('finished')
  })

  it('stores a lobby update without pulling the player off the table', () => {
    const next = gameReducer(onTable(), { type: 'lobby', lobby })
    expect(next.screen).toBe('table')
    expect(next.lobby).toEqual(lobby)
  })

  it('appends chat and events to one feed, in order', () => {
    const withChat = gameReducer(initialState, {
      type: 'chat',
      message: { seat: 1, name: 'Ben', text: 'hi' },
    })
    const withBoth = gameReducer(withChat, { type: 'event', event: { type: 'unoCalled', seat: 1 } })
    expect(withBoth.feed.map((entry) => entry.kind)).toEqual(['chat', 'event'])
  })

  it('gives every feed entry a distinct id', () => {
    let state = initialState
    for (let i = 0; i < 5; i++) {
      state = gameReducer(state, { type: 'event', event: { type: 'unoCalled', seat: 0 } })
    }
    expect(new Set(state.feed.map((entry) => entry.id)).size).toBe(5)
  })

  it('caps the feed so a long game cannot grow without bound', () => {
    let state = initialState
    for (let i = 0; i < FEED_LIMIT + 30; i++) {
      state = gameReducer(state, { type: 'event', event: { type: 'unoCalled', seat: 0 } })
    }
    expect(state.feed).toHaveLength(FEED_LIMIT)
  })

  it('keeps the newest entries when it trims', () => {
    let state = initialState
    for (let i = 0; i < FEED_LIMIT + 5; i++) {
      state = gameReducer(state, { type: 'chat', message: { seat: 0, name: 'a', text: `m${i}` } })
    }
    const last = state.feed[state.feed.length - 1]
    expect(last?.kind === 'chat' && last.text).toBe(`m${FEED_LIMIT + 4}`)
  })

  it('records an error and clears it on the next success', () => {
    const failed = gameReducer(initialState, { type: 'error', message: 'Room is full' })
    expect(failed.error).toBe('Room is full')
    expect(gameReducer(failed, { type: 'joined', roomCode: 'ABC234', seat: 1 }).error).toBeNull()
  })

  it('marks the connection lost without discarding the last view', () => {
    const lost = gameReducer(onTable(), { type: 'connection', connection: 'lost' })
    expect(lost.connection).toBe('lost')
    expect(lost.view).toBe(view)
    expect(lost.screen).toBe('table')
  })

  it('returns home and forgets the room when the player leaves', () => {
    const left = gameReducer(onTable(), { type: 'left' })
    expect(left.screen).toBe('home')
    expect(left.roomCode).toBeNull()
    expect(left.view).toBeNull()
    expect(left.feed).toEqual([])
  })

  it('keeps the connection state across leaving, since the socket is still up', () => {
    const open = gameReducer(onTable(), { type: 'connection', connection: 'open' })
    expect(gameReducer(open, { type: 'left' }).connection).toBe('open')
  })

  it('raises a toast for a notable event and none for a routine one', () => {
    const notable = gameReducer(initialState, {
      type: 'event',
      event: { type: 'unoPenalty', seat: 0, count: 2 },
    })
    expect(notable.toasts).toHaveLength(1)

    const routine = gameReducer(initialState, {
      type: 'event',
      event: { type: 'cardsDrawn', seat: 1, count: 1 },
    })
    expect(routine.toasts).toHaveLength(0)
  })

  it('distinguishes an abandoned game from a win in its toast', () => {
    const abandoned = gameReducer(initialState, {
      type: 'event',
      event: { type: 'roundEnded', winner: null, awarded: [0, 0], scores: [0, 0] },
    })
    expect(abandoned.toasts[0]?.tone).toBe('bad')

    const won = gameReducer(initialState, {
      type: 'event',
      event: { type: 'roundEnded', winner: 1, awarded: [0, 7], scores: [0, 7] },
    })
    expect(won.toasts[0]?.tone).toBe('info')
  })

  it('dismisses a toast by id', () => {
    const withToast = gameReducer(initialState, {
      type: 'event',
      event: { type: 'roundEnded', winner: 1, awarded: [0, 7], scores: [0, 7] },
    })
    const id = withToast.toasts[0]?.id
    if (id === undefined) throw new Error('expected a toast')
    expect(gameReducer(withToast, { type: 'dismissToast', id }).toasts).toEqual([])
  })

  it('caps the toasts so they cannot bury the table', () => {
    let state = initialState
    for (let i = 0; i < 10; i++) {
      state = gameReducer(state, { type: 'event', event: { type: 'seatLeft', seat: 0 } })
    }
    expect(state.toasts.length).toBeLessThanOrEqual(4)
  })

  it('never mutates the state it is given', () => {
    const before = structuredClone(initialState)
    gameReducer(initialState, { type: 'chat', message: { seat: 0, name: 'a', text: 'x' } })
    expect(initialState).toEqual(before)
  })
})
