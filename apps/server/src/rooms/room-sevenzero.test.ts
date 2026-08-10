import type { Move, TableRules } from '@uno/engine'
import type { GameEvent, PlayerView } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { Room } from './room.js'
import { emptyStatsFor, tally } from './stats.js'

/*
 * Seven-Zero as the Room reports it. The engine owns whether a swap is legal; what
 * is checked here is that hands moving becomes the events the log and the sounds
 * read, that it is never mistaken for a draw, and that every one of them goes
 * through the recording funnel.
 */

type PlayMove = Extract<Move, { type: 'play' }>

const roomWith = (rules: TableRules): Room => {
  const room = new Room('ABC234', 42, { kind: 'rounds', count: 3 }, null, rules)
  room.join('Ana', 'socket-0')
  room.join('Ben', 'socket-1')
  room.join('Cleo', 'socket-2')
  room.start(0)
  return room
}

const SEATS = [0, 1, 2]

/** A swap the server is offering the seat on turn, if it is offering one. */
const swapOffered = (room: Room, seat: number): PlayMove | undefined =>
  room
    .viewFor(seat)
    ?.you.legalMoves.find(
      (move): move is PlayMove => move.type === 'play' && move.swapWith !== undefined,
    )

/** A 0 the seat on turn may lay down, which needs the hand to name the card. */
const zeroOffered = (room: Room, seat: number): PlayMove | undefined => {
  const view: PlayerView | null = room.viewFor(seat)
  if (view === null) return undefined
  return view.you.legalMoves.find((move): move is PlayMove => {
    if (move.type !== 'play') return false
    const card = view.you.hand.find((held) => held.id === move.cardId)
    return card?.kind === 'number' && card.value === 0
  })
}

/** Anything to get on with that is neither a swap nor the card being hunted. */
const ordinaryMove = (room: Room, seat: number, avoid: PlayMove | undefined): Move | undefined => {
  const moves = room.viewFor(seat)?.you.legalMoves ?? []
  const plain = moves.filter(
    (move) => move.type === 'play' && move.swapWith === undefined && move.cardId !== avoid?.cardId,
  )
  return (
    plain[0] ??
    moves.find((move) => move.type === 'acceptDraw') ??
    moves.find((move) => move.type === 'draw')
  )
}

/**
 * Plays the round on until the seat holding the turn is offered the move `find`
 * looks for. Deterministic: the room is seeded, so the same table always reaches
 * the same moment.
 */
const playUntil = (
  room: Room,
  find: (room: Room, seat: number) => PlayMove | undefined,
): { seat: number; move: PlayMove; events: GameEvent[] } => {
  const events: GameEvent[] = []
  for (let turn = 0; turn < 400; turn += 1) {
    const seat = room.currentSeat
    if (seat === null || room.viewFor(seat)?.phase !== 'playing') break

    const wanted = find(room, seat)
    if (wanted !== undefined) return { seat, move: wanted, events }

    const move = ordinaryMove(room, seat, wanted)
    if (move === undefined) break
    const result = room.move(seat, move)
    if (!result.okay) throw new Error(`legal move rejected: ${result.error}`)
    events.push(...result.value)
  }
  throw new Error('the round ended before the move was ever offered')
}

const heldBy = (room: Room, seat: number): string[] =>
  (room.viewFor(seat)?.you.hand ?? []).map((card) => card.id)

describe('a room playing with Seven-Zero', () => {
  it('offers the seat on turn one swap per other active seat', () => {
    const room = roomWith({ liar: false, sevenZero: true, jumpIn: false, playDrawnCard: false })
    const { seat, move } = playUntil(room, swapOffered)

    const swaps = (room.viewFor(seat)?.you.legalMoves ?? []).filter(
      (candidate) => candidate.type === 'play' && candidate.cardId === move.cardId,
    )
    expect(swaps).toHaveLength(2)
    expect(
      swaps.map((candidate) => (candidate.type === 'play' ? candidate.swapWith : null)).sort(),
    ).toEqual(SEATS.filter((other) => other !== seat))
  })

  it('reports a swap as handsSwapped and never as cards drawn', () => {
    /* The mistake this guards: the hand-size diff below `cardPlayed` reading a
       permutation as a draw, which would report cards nobody took and count them in
       the statistics. */
    const room = roomWith({ liar: false, sevenZero: true, jumpIn: false, playDrawnCard: false })
    const { seat, move } = playUntil(room, swapOffered)
    const target = move.swapWith ?? -1

    const mineBefore = heldBy(room, seat)
    const theirsBefore = heldBy(room, target)
    const result = room.move(seat, move)
    if (!result.okay) throw new Error(result.error)

    expect(result.value.filter((event) => event.type !== 'cardPlayed')).toEqual([
      { type: 'handsSwapped', seat, with: target },
    ])
    expect(result.value.some((event) => event.type === 'cardsDrawn')).toBe(false)
    expect(result.value.some((event) => event.type === 'unoPenalty')).toBe(false)

    // The hands really did change places, minus the card that was laid down.
    expect(heldBy(room, seat)).toEqual(theirsBefore)
    expect(heldBy(room, target)).toEqual(mineBefore.filter((id) => id !== move.cardId))
  })

  it('reports a rotation with the direction the hands went', () => {
    const room = roomWith({ liar: false, sevenZero: true, jumpIn: false, playDrawnCard: false })
    const { seat, move } = playUntil(room, zeroOffered)
    const before = SEATS.map((index) => heldBy(room, index))
    // A 0 does not change the direction, so the one in play is where hands go. Read
    // rather than assumed: a reverse earlier in the round legitimately flips it.
    const direction = room.viewFor(seat)?.direction ?? 1

    const result = room.move(seat, move)
    if (!result.okay) throw new Error(result.error)
    expect(result.value.filter((event) => event.type !== 'cardPlayed')).toEqual([
      { type: 'handsRotated', direction },
    ])

    // One seat along, whichever way play is going.
    for (const index of SEATS) {
      const expected = (before[index] ?? []).filter((id) => id !== move.cardId)
      const landing = (index + direction + SEATS.length) % SEATS.length
      expect(heldBy(room, landing)).toEqual(expected)
    }
  })

  it('counts hands moving as nothing, through the same funnel as everything else', () => {
    const room = roomWith({ liar: false, sevenZero: true, jumpIn: false, playDrawnCard: false })
    const { seat, move, events } = playUntil(room, swapOffered)
    const result = room.move(seat, move)
    if (!result.okay) throw new Error(result.error)

    // A statistic the room reported but never recorded would show up here.
    const seen = [...events, ...result.value]
    expect(room.viewFor(0)?.match.stats).toEqual(tally(emptyStatsFor(3), seen))
  })

  it('opens a Liar window when a swap leaves a seat holding one card', () => {
    /* The two options meeting: the seat handed a single card never had a turn on
       which it could call UNO, so a window — escapable on its own next turn — is
       what it gets, rather than two cards it could not have avoided. */
    const room = roomWith({ liar: true, sevenZero: true, jumpIn: false, playDrawnCard: false })
    for (let turn = 0; turn < 400; turn += 1) {
      const seat = room.currentSeat
      if (seat === null || room.viewFor(seat)?.phase !== 'playing') break

      const swap = swapOffered(room, seat)
      if (swap !== undefined) {
        const result = room.move(seat, swap)
        if (!result.okay) throw new Error(result.error)

        /* Whoever ends up on one card is the one who may be accused, decided by what
           each seat now holds rather than by who played the card. */
        for (const watched of SEATS) {
          if ((room.viewFor(watched)?.you.hand ?? []).length !== 1) continue
          const accuser = SEATS.find((other) => other !== watched) ?? 0
          expect(room.viewFor(accuser)?.you.legalMoves).toContainEqual({
            type: 'callOut',
            target: watched,
          })
        }
        return
      }

      const move = ordinaryMove(room, seat, undefined)
      if (move === undefined) break
      const result = room.move(seat, move)
      if (!result.okay) throw new Error(result.error)
    }
    throw new Error('no swap was ever offered')
  })
})

describe('a room playing plain UNO', () => {
  it('never offers a swap, so the option is genuinely opt-in', () => {
    const room = roomWith({ liar: false, sevenZero: false, jumpIn: false, playDrawnCard: false })
    for (let turn = 0; turn < 400; turn += 1) {
      const seat = room.currentSeat
      if (seat === null || room.viewFor(seat)?.phase !== 'playing') break
      for (const watcher of SEATS) {
        expect(swapOffered(room, watcher)).toBeUndefined()
      }
      const move = ordinaryMove(room, seat, undefined)
      if (move === undefined) break
      const result = room.move(seat, move)
      if (!result.okay) throw new Error(result.error)
      expect(result.value.some((event) => event.type === 'handsSwapped')).toBe(false)
      expect(result.value.some((event) => event.type === 'handsRotated')).toBe(false)
    }
  })
})
