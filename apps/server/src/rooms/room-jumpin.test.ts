import type { Move, TableRules } from '@uno/engine'
import type { GameEvent } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { Room } from './room.js'
import { emptyStatsFor, tally } from './stats.js'

/*
 * Jump-in as the Room reports it. The engine owns whether a jump-in is legal; what
 * is checked here is that a card laid down by a seat whose turn it was not becomes
 * the events the log reads, that the turn really moves to the jumper in the view
 * every player receives, and that every event goes through the recording funnel.
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

/**
 * A jump-in the server is offering somebody: a `play` in the view of a seat that is
 * not the one holding the turn. Nothing else can be offered off turn but a call-out,
 * which is a different move type.
 */
const jumpOffered = (room: Room): { seat: number; move: PlayMove } | undefined => {
  for (const seat of SEATS) {
    if (seat === room.currentSeat) continue
    const move = (room.viewFor(seat)?.you.legalMoves ?? []).find(
      (candidate): candidate is PlayMove => candidate.type === 'play',
    )
    if (move !== undefined) return { seat, move }
  }
  return undefined
}

const ordinaryMove = (room: Room, seat: number): Move | undefined => {
  const moves = room.viewFor(seat)?.you.legalMoves ?? []
  return (
    moves.find((move) => move.type === 'callUno') ??
    moves.find((move) => move.type === 'play') ??
    moves.find((move) => move.type === 'acceptDraw') ??
    moves.find((move) => move.type === 'draw')
  )
}

/**
 * Plays the round on until somebody off turn is offered a jump-in. Deterministic:
 * the room is seeded, so the same table always reaches the same moment.
 */
const playUntilJumpable = (room: Room): { seat: number; move: PlayMove; events: GameEvent[] } => {
  const events: GameEvent[] = []
  for (let turn = 0; turn < 400; turn += 1) {
    const onTurn = room.currentSeat
    if (onTurn === null || room.viewFor(onTurn)?.phase !== 'playing') break

    const jump = jumpOffered(room)
    if (jump !== undefined) return { ...jump, events }

    const move = ordinaryMove(room, onTurn)
    if (move === undefined) break
    const result = room.move(onTurn, move)
    if (!result.okay) throw new Error(`legal move rejected: ${result.error}`)
    events.push(...result.value)
  }
  throw new Error('the round ended before a jump-in was ever offered')
}

const heldBy = (room: Room, seat: number): string[] =>
  (room.viewFor(seat)?.you.hand ?? []).map((card) => card.id)

describe('a room playing with jump-in', () => {
  it('offers a card identical to the top to a seat whose turn it is not', () => {
    const room = roomWith({ liar: false, sevenZero: false, jumpIn: true, playDrawnCard: false })
    const { seat, move } = playUntilJumpable(room)
    const view = room.viewFor(seat)

    expect(seat).not.toBe(room.currentSeat)
    // What the server offered, and nothing that only a seat on turn could do.
    expect(view?.you.legalMoves).toEqual([move])
    const card = view?.you.hand.find((held) => held.id === move.cardId)
    const top = view?.discardTop
    expect(card).toBeDefined()
    expect(top?.kind).toBe(card?.kind)
    if (card !== undefined && top !== undefined && 'color' in card && 'color' in top) {
      expect(card.color).toBe(top.color)
    }
  })

  it('reports the jump-in beside the card, and moves the turn to the jumper', () => {
    const room = roomWith({ liar: false, sevenZero: false, jumpIn: true, playDrawnCard: false })
    const { seat, move } = playUntilJumpable(room)
    const held = heldBy(room, seat)
    const card = room.viewFor(seat)?.you.hand.find((held) => held.id === move.cardId)
    const direction = room.viewFor(seat)?.direction ?? 1

    const result = room.move(seat, move)
    if (!result.okay) throw new Error(result.error)

    /* Named before the card, because it is what makes the card surprising: the log
       says play moved, then says what was laid down. */
    expect(result.value[0]).toEqual({ type: 'jumpedIn', seat })
    expect(result.value[1]).toMatchObject({ type: 'cardPlayed', seat })
    expect(heldBy(room, seat)).toEqual(held.filter((id) => id !== move.cardId))

    /* Play carries on from the jumper, so the turn is one seat along from THEM and
       not from whoever was holding it — which is the entire point of the rule.
       Skipped when the card carries an effect of its own: a skip or a reverse moves
       the turn two, and both are legitimate cards to jump. */
    if (card?.kind === 'number' || card?.kind === 'draw2') {
      expect(room.currentSeat).toBe((seat + direction + SEATS.length) % SEATS.length)
    }
    for (const watcher of SEATS) {
      expect(room.viewFor(watcher)?.currentSeat).toBe(room.currentSeat)
    }
  })

  it('counts the jump as nothing and the card once, through the one funnel', () => {
    const room = roomWith({ liar: false, sevenZero: false, jumpIn: true, playDrawnCard: false })
    const { seat, move, events } = playUntilJumpable(room)
    const result = room.move(seat, move)
    if (!result.okay) throw new Error(result.error)

    // A statistic the room reported but never recorded would show up here.
    const seen = [...events, ...result.value]
    expect(room.viewFor(0)?.match.stats).toEqual(tally(emptyStatsFor(3), seen))
    // The card is counted by `cardPlayed`; the jump adds nothing of its own.
    const before = tally(emptyStatsFor(3), events)
    expect(room.viewFor(0)?.match.stats[seat]?.cardsPlayed).toBe(
      (before[seat]?.cardsPlayed ?? 0) + 1,
    )
  })

  it('refuses the same jump-in twice, which is what the loser of a race gets', () => {
    const room = roomWith({ liar: false, sevenZero: false, jumpIn: true, playDrawnCard: false })
    const { seat, move } = playUntilJumpable(room)
    expect(room.move(seat, move).okay).toBe(true)
    expect(room.move(seat, move)).toEqual({ okay: false, error: 'illegal_move' })
  })

  it('still refuses an off-turn play of a card that is not identical', () => {
    const room = roomWith({ liar: false, sevenZero: false, jumpIn: true, playDrawnCard: false })
    const { seat } = playUntilJumpable(room)
    const other = (room.viewFor(seat)?.you.hand ?? []).find(
      (card) => card.id !== jumpOffered(room)?.move.cardId,
    )
    if (other === undefined) throw new Error('the jumper held only the one card')
    expect(room.move(seat, { type: 'play', cardId: other.id })).toEqual({
      okay: false,
      error: 'illegal_move',
    })
  })
})

describe('a room playing plain UNO', () => {
  it('never offers an off-turn play, so the option is genuinely opt-in', () => {
    const room = roomWith({ liar: false, sevenZero: false, jumpIn: false, playDrawnCard: false })
    for (let turn = 0; turn < 400; turn += 1) {
      const onTurn = room.currentSeat
      if (onTurn === null || room.viewFor(onTurn)?.phase !== 'playing') break
      expect(jumpOffered(room)).toBeUndefined()

      const move = ordinaryMove(room, onTurn)
      if (move === undefined) break
      const result = room.move(onTurn, move)
      if (!result.okay) throw new Error(result.error)
      expect(result.value.some((event) => event.type === 'jumpedIn')).toBe(false)
    }
  })

  it('refuses an off-turn play as not that seat’s turn', () => {
    const room = roomWith({ liar: false, sevenZero: false, jumpIn: false, playDrawnCard: false })
    const onTurn = room.currentSeat ?? 0
    const other = SEATS.find((seat) => seat !== onTurn) ?? 0
    const card = room.viewFor(other)?.you.hand[0]
    if (card === undefined) throw new Error('an empty hand at the deal')
    expect(room.move(other, { type: 'play', cardId: card.id })).toEqual({
      okay: false,
      error: 'not_your_turn',
    })
  })
})
