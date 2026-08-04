import type { Card, CardId } from '@uno/engine'
import { describe, expect, it } from 'vitest'
import { describeEvent } from './describe-event.js'

const nameOf = (seat: number) => ['Ana', 'Ben', 'Cleo'][seat] ?? `Seat ${seat}`
const draw2: Card = { id: 'c' as CardId, kind: 'draw2', color: 'B' }

describe('describeEvent', () => {
  it('names the player who played a card', () => {
    expect(describeEvent({ type: 'cardPlayed', seat: 1, card: draw2 }, nameOf)).toBe(
      'Ben played a Blue draw two',
    )
  })

  it('names every card kind', () => {
    const named = (card: Card) => describeEvent({ type: 'cardPlayed', seat: 0, card }, nameOf)
    expect(named({ id: 'a' as CardId, kind: 'number', color: 'R', value: 7 })).toContain('Red 7')
    expect(named({ id: 'b' as CardId, kind: 'skip', color: 'G' })).toContain('Green skip')
    expect(named({ id: 'c' as CardId, kind: 'reverse', color: 'Y' })).toContain('Yellow reverse')
    expect(named({ id: 'd' as CardId, kind: 'wild' })).toContain('Wild')
    expect(named({ id: 'e' as CardId, kind: 'wild4' })).toContain('Wild draw four')
  })

  it('uses singular and plural correctly for drawn cards', () => {
    expect(describeEvent({ type: 'cardsDrawn', seat: 0, count: 1 }, nameOf)).toBe('Ana drew a card')
    expect(describeEvent({ type: 'cardsDrawn', seat: 0, count: 4 }, nameOf)).toBe(
      'Ana drew 4 cards',
    )
  })

  it('describes the uno call and its penalty', () => {
    expect(describeEvent({ type: 'unoCalled', seat: 2 }, nameOf)).toBe('Cleo called UNO')
    expect(describeEvent({ type: 'unoPenalty', seat: 2, count: 2 }, nameOf)).toBe(
      'Cleo forgot to call UNO and drew 2',
    )
  })

  it('describes presence changes', () => {
    expect(describeEvent({ type: 'seatDisconnected', seat: 1 }, nameOf)).toBe('Ben lost connection')
    expect(describeEvent({ type: 'seatReconnected', seat: 1 }, nameOf)).toBe('Ben is back')
    expect(describeEvent({ type: 'seatLeft', seat: 1 }, nameOf)).toBe('Ben left the game')
  })

  it('distinguishes a win from an abandoned game', () => {
    expect(describeEvent({ type: 'gameOver', winner: 0 }, nameOf)).toBe('Ana wins')
    expect(describeEvent({ type: 'gameOver', winner: null }, nameOf)).toBe(
      'Game abandoned — not enough players',
    )
  })

  it('describes a restart', () => {
    expect(describeEvent({ type: 'gameRestarted' }, nameOf)).toBe('A new game was dealt')
  })

  it('falls back to a seat number for an unknown seat', () => {
    expect(describeEvent({ type: 'unoCalled', seat: 9 }, nameOf)).toBe('Seat 9 called UNO')
  })
})
