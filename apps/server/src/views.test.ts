import { initGame, legalMoves, turnOrder } from '@uno/engine'
import { describe, expect, it } from 'vitest'
import { DEFAULT_MATCH_GOAL, type MatchProgress } from '@uno/protocol'
import { redactFor } from './views.js'

/** Match standings are passed through untouched, so any valid value will do. */
const progress: MatchProgress = {
  goal: DEFAULT_MATCH_GOAL,
  scores: [0, 0, 0],
  round: 1,
  winners: null,
  stats: [],
}

const humansPresent = ['Ana', 'Ben', 'Cleo'].map(() => ({
  bot: null,
  standIn: false,
  status: 'active' as const,
}))

const game = (seed = 21) => {
  const init = initGame({ names: ['Ana', 'Ben', 'Cleo'], seed })
  if (!init.okay) throw new Error(init.error)
  return init.value
}

describe('redactFor', () => {
  it('returns null for an unknown seat', () => {
    expect(redactFor(game(), 9, progress, humansPresent)).toBeNull()
  })

  it('gives the seat its own hand', () => {
    const state = game()
    expect(redactFor(state, 0, progress, humansPresent)?.you.hand).toEqual(state.seats[0]?.hand)
  })

  it('never leaks an opponent card id, whatever the shape of the view', () => {
    const state = game()
    const serialised = JSON.stringify(redactFor(state, 0, progress, humansPresent))
    const opponentCardIds = state.seats
      .filter((s) => s.index !== 0)
      .flatMap((s) => s.hand.map((c) => c.id))

    expect(opponentCardIds.length).toBeGreaterThan(0)
    for (const id of opponentCardIds) expect(serialised).not.toContain(id)
  })

  it('never leaks the contents of the draw pile', () => {
    const state = game()
    const serialised = JSON.stringify(redactFor(state, 0, progress, humansPresent))
    for (const card of state.drawPile) expect(serialised).not.toContain(card.id)
  })

  it('exposes opponents as a count only', () => {
    expect(redactFor(game(), 0, progress, humansPresent)?.opponents).toEqual([
      { seat: 1, name: 'Ben', handCount: 7, status: 'active', bot: null, standIn: false },
      { seat: 2, name: 'Cleo', handCount: 7, status: 'active', bot: null, standIn: false },
    ])
  })

  it('takes opponent status, bot and standIn from the occupants, not the engine', () => {
    const occupants = [
      humansPresent[0]!,
      { bot: 'hard' as const, standIn: false, status: 'active' as const },
      { bot: null, standIn: true, status: 'disconnected' as const },
    ]
    expect(redactFor(game(), 0, progress, occupants)?.opponents).toEqual([
      expect.objectContaining({ seat: 1, status: 'active', bot: 'hard', standIn: false }),
      expect.objectContaining({ seat: 2, status: 'disconnected', bot: null, standIn: true }),
    ])
  })

  it('carries the legal moves of that seat', () => {
    const state = game()
    expect(redactFor(state, 0, progress, humansPresent)?.you.legalMoves).toEqual(
      legalMoves(state, 0),
    )
  })

  it('gives an empty move list to a seat whose turn it is not', () => {
    expect(redactFor(game(), 1, progress, humansPresent)?.you.legalMoves).toEqual([])
  })

  it('mirrors the public table state', () => {
    const state = game()
    const view = redactFor(state, 2, progress, humansPresent)
    expect(view?.discardTop).toEqual(state.discardPile[state.discardPile.length - 1])
    expect(view?.currentColor).toBe(state.currentColor)
    expect(view?.currentSeat).toBe(state.currentSeat)
    expect(view?.direction).toBe(state.direction)
    expect(view?.drawPileCount).toBe(state.drawPile.length)
    expect(view?.pendingDraw).toBeNull()
    expect(view?.phase).toBe('playing')
    expect(view?.winner).toBeNull()
  })

  it('carries the order of play, the seat on turn excluded', () => {
    const state = game()
    const view = redactFor(state, 2, progress, humansPresent)
    expect(view?.turnOrder).toEqual(turnOrder(state))
    expect(view?.turnOrder).not.toContain(state.currentSeat)
  })

  it('hands out a copy, so a caller cannot mutate engine state', () => {
    const state = game()
    redactFor(state, 0, progress, humansPresent)?.you.hand.pop()
    expect(state.seats[0]?.hand).toHaveLength(7)
  })
})
