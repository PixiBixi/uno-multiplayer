import { DEFAULT_TABLE_RULES, type TableRules } from '@uno/engine'
import { DEFAULT_MATCH_GOAL } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { Room } from './room.js'

/** Every flag flipped away from its default, so a change that was ignored is visible. */
const DEFAULT_TABLE_RULES_ON: TableRules = {
  liar: true,
  sevenZero: true,
  jumpIn: true,
  playDrawnCard: false,
}

const roomWith = (...names: string[]) => {
  const room = new Room('ABC234', 7, DEFAULT_MATCH_GOAL)
  names.forEach((name, i) => {
    const result = room.join(name, `socket-${i}`)
    if (!result.okay) throw new Error(result.error)
  })
  return room
}

describe('Room.join', () => {
  it('starts in the lobby with nobody seated', () => {
    const room = new Room('ABC234', 7, DEFAULT_MATCH_GOAL)
    expect(room.phase).toBe('lobby')
    expect(room.memberCount).toBe(0)
    expect(room.isEmpty()).toBe(true)
  })

  it('seats players in arrival order from index zero', () => {
    const room = roomWith('Ana', 'Ben')
    expect(room.memberAt(0)?.name).toBe('Ana')
    expect(room.memberAt(1)?.name).toBe('Ben')
  })

  it('returns a distinct session token per seat', () => {
    const room = new Room('ABC234', 7, DEFAULT_MATCH_GOAL)
    const a = room.join('Ana', 'socket-a')
    const b = room.join('Ben', 'socket-b')
    if (!a.okay || !b.okay) throw new Error('expected both joins to succeed')
    expect(a.value.sessionToken).not.toBe(b.value.sessionToken)
    expect(a.value.seat).toBe(0)
    expect(b.value.seat).toBe(1)
  })

  it('makes the first player the host', () => {
    expect(roomWith('Ana', 'Ben').hostSeat).toBe(0)
  })

  it('refuses a fifth player', () => {
    const room = roomWith('Ana', 'Ben', 'Cleo', 'Dan')
    expect(room.join('Eve', 'socket-4')).toEqual({ okay: false, error: 'room_full' })
  })

  it('maps a socket id back to its seat', () => {
    const room = roomWith('Ana', 'Ben')
    expect(room.seatOfSocket('socket-1')).toBe(1)
    expect(room.seatOfSocket('unknown')).toBeNull()
  })

  it('refuses a join once the game has started', () => {
    const room = roomWith('Ana', 'Ben')
    const started = room.start(0)
    if (!started.okay) throw new Error(started.error)
    expect(room.join('Cleo', 'socket-2')).toEqual({
      okay: false,
      error: 'game_already_started',
    })
  })
})

describe('Room.lobbyView', () => {
  it('describes the table without exposing session tokens', () => {
    const view = roomWith('Ana', 'Ben').lobbyView()
    expect(view).toEqual({
      roomCode: 'ABC234',
      hostSeat: 0,
      seats: [
        { seat: 0, name: 'Ana', status: 'active' },
        { seat: 1, name: 'Ben', status: 'active' },
      ],
      canStart: true,
      goal: DEFAULT_MATCH_GOAL,
      pace: null,
      /* On the wire so a guest can read them. They used to be withheld, which meant a
         player learned about Seven-Zero when their hand changed owner. */
      rules: DEFAULT_TABLE_RULES,
      configurable: true,
    })
    expect(JSON.stringify(view)).not.toContain('sessionToken')
  })

  it('cannot start with a single player', () => {
    expect(roomWith('Ana').lobbyView().canStart).toBe(false)
  })

  it('can start from two players onward', () => {
    expect(roomWith('Ana', 'Ben', 'Cleo').lobbyView().canStart).toBe(true)
  })
})

describe('Room.configure', () => {
  it('changes the goal, the pace and the rules the table will be dealt with', () => {
    const room = roomWith('Ana', 'Ben')
    const rules: TableRules = { liar: true, sevenZero: true, jumpIn: true, playDrawnCard: false }

    expect(
      room.configure(0, { goal: { kind: 'rounds', count: 3 }, pace: { turnSeconds: 20 }, rules }),
    ).toEqual({ okay: true, value: [] })

    const view = room.lobbyView()
    expect(view.goal).toEqual({ kind: 'rounds', count: 3 })
    expect(view.pace).toEqual({ turnSeconds: 20 })
    expect(view.rules).toEqual(rules)
  })

  it('leaves out of the payload whatever the payload leaves out', () => {
    /* The reason the event is partial: toggling one rule must not carry a goal the
       client read a moment ago and would otherwise write back over a newer one. */
    const room = roomWith('Ana', 'Ben')
    room.configure(0, { goal: { kind: 'rounds', count: 5 }, pace: { turnSeconds: 30 } })
    room.configure(0, {
      rules: { liar: true, sevenZero: false, jumpIn: false, playDrawnCard: true },
    })

    const view = room.lobbyView()
    expect(view.goal).toEqual({ kind: 'rounds', count: 5 })
    expect(view.pace).toEqual({ turnSeconds: 30 })
    expect(view.rules.liar).toBe(true)
  })

  it('takes the clock off the table when the pace is explicitly null', () => {
    const room = roomWith('Ana', 'Ben')
    room.configure(0, { pace: { turnSeconds: 10 } })
    expect(room.turnSeconds).toBe(10)
    room.configure(0, { pace: null })
    expect(room.turnSeconds).toBeNull()
  })

  it('refuses anybody who is not the host, and changes nothing', () => {
    const room = roomWith('Ana', 'Ben')
    const before = room.lobbyView()
    expect(room.configure(1, { rules: DEFAULT_TABLE_RULES_ON })).toEqual({
      okay: false,
      error: 'not_host',
    })
    expect(room.lobbyView()).toEqual(before)
  })

  it('refuses a change once the match has been dealt', () => {
    const room = roomWith('Ana', 'Ben')
    const started = room.start(0)
    if (!started.okay) throw new Error(started.error)
    expect(room.configure(0, { rules: DEFAULT_TABLE_RULES_ON })).toEqual({
      okay: false,
      error: 'game_already_started',
    })
  })

  it('is still refused in a room that has dealt but can no longer start', () => {
    /* The case that separates the real lock from `canStart`. Two of three players drop,
       so the room reports it cannot start — and it is nonetheless mid-match, holding a
       score, with hands on the table. Gating on `canStart` would reopen the rules here,
       which is the one moment they must not move. */
    const room = roomWith('Ana', 'Ben', 'Cleo')
    const started = room.start(0)
    if (!started.okay) throw new Error(started.error)
    room.disconnect('socket-1')
    room.disconnect('socket-2')

    expect(room.lobbyView().canStart).toBe(false)
    expect(room.lobbyView().configurable).toBe(false)
    expect(room.configure(0, { rules: DEFAULT_TABLE_RULES_ON })).toEqual({
      okay: false,
      error: 'game_already_started',
    })
  })

  it('stays refused after a restart, which deals a new match rather than reopening the lobby', () => {
    /* `restart` requires a finished round and deals immediately, so it never returns
       anybody to a lobby. There is therefore no moment after it at which the table is
       unconfigured, and the lock does not lift. */
    const room = roomWith('Ana', 'Ben')
    const started = room.start(0)
    if (!started.okay) throw new Error(started.error)
    expect(room.restart(0, 9)).toEqual({ okay: false, error: 'round_in_progress' })
    expect(room.lobbyView().configurable).toBe(false)
  })

  it('reports the lobby as configurable only before the deal', () => {
    const room = roomWith('Ana', 'Ben')
    expect(room.lobbyView().configurable).toBe(true)
    const started = room.start(0)
    if (!started.okay) throw new Error(started.error)
    expect(room.lobbyView().configurable).toBe(false)
  })

  it('arms nothing: a pace set in the lobby is a number, not a running clock', () => {
    // The clock is armed by RoomManager at the deal. A lobby that could start one would
    // be timing out a seat holding no cards.
    const room = roomWith('Ana', 'Ben')
    room.configure(0, { pace: { turnSeconds: 5 } })
    expect(room.awaitingMove).toBe(false)
    expect(room.betweenRounds).toBe(false)
    expect(room.viewFor(0)).toBeNull()
  })
})
