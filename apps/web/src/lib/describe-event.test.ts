import type { Card, CardId } from '@uno/engine'
import { describe, expect, it } from 'vitest'
import { describeEvent } from './describe-event.js'

const nameOf = (seat: number) => ['Ana', 'Ben', 'Cleo'][seat] ?? `Seat ${seat}`
/* Seat 0 is 'Ana' here, so nobody is the viewer unless a test says so. */
const NOT_ME = 9
const draw2: Card = { id: 'c' as CardId, kind: 'draw2', color: 'B' }

describe('describeEvent', () => {
  it('names the player who played a card', () => {
    expect(describeEvent({ type: 'cardPlayed', seat: 1, card: draw2 }, nameOf, NOT_ME)).toBe(
      'Ben played a Blue draw two',
    )
  })

  it('names every card kind', () => {
    const named = (card: Card) =>
      describeEvent({ type: 'cardPlayed', seat: 0, card }, nameOf, NOT_ME)
    expect(named({ id: 'a' as CardId, kind: 'number', color: 'R', value: 7 })).toContain('Red 7')
    expect(named({ id: 'b' as CardId, kind: 'skip', color: 'G' })).toContain('Green skip')
    expect(named({ id: 'c' as CardId, kind: 'reverse', color: 'Y' })).toContain('Yellow reverse')
    expect(named({ id: 'd' as CardId, kind: 'wild' })).toContain('Wild')
    expect(named({ id: 'e' as CardId, kind: 'wild4' })).toContain('Wild draw four')
  })

  it('uses singular and plural correctly for drawn cards', () => {
    expect(describeEvent({ type: 'cardsDrawn', seat: 0, count: 1 }, nameOf, NOT_ME)).toBe(
      'Ana drew a card',
    )
    expect(describeEvent({ type: 'cardsDrawn', seat: 0, count: 4 }, nameOf, NOT_ME)).toBe(
      'Ana drew 4 cards',
    )
  })

  it('describes the uno call and its penalty', () => {
    expect(describeEvent({ type: 'unoCalled', seat: 2 }, nameOf, NOT_ME)).toBe('Cleo called UNO')
    expect(describeEvent({ type: 'unoPenalty', seat: 2, count: 2 }, nameOf, NOT_ME)).toBe(
      'Cleo forgot to call UNO and drew 2 cards',
    )
  })

  it('describes presence changes', () => {
    expect(describeEvent({ type: 'seatDisconnected', seat: 1 }, nameOf, NOT_ME)).toBe(
      'Ben lost connection',
    )
    expect(describeEvent({ type: 'seatReconnected', seat: 1 }, nameOf, NOT_ME)).toBe('Ben is back')
    expect(describeEvent({ type: 'seatLeft', seat: 1 }, nameOf, NOT_ME)).toBe('Ben left the game')
  })

  it('distinguishes a win from an abandoned round', () => {
    expect(
      describeEvent(
        { type: 'roundEnded', winner: 0, awarded: [77, 0], scores: [77, 0] },
        nameOf,
        NOT_ME,
      ),
    ).toBe('Ana wins the round, +77 points')
    expect(
      describeEvent(
        { type: 'roundEnded', winner: null, awarded: [0, 0], scores: [0, 0] },
        nameOf,
        NOT_ME,
      ),
    ).toBe('Round abandoned — not enough players')
  })

  it('conjugates the second person when the viewer won', () => {
    const asYou = (seat: number) => (seat === 0 ? 'You' : nameOf(seat))
    expect(
      describeEvent({ type: 'roundEnded', winner: 0, awarded: [12, 0], scores: [12, 0] }, asYou, 0),
    ).toBe('You win the round, +12 points')
  })

  it('conjugates the second person when the viewer reconnects', () => {
    const asYou = (seat: number) => (seat === 0 ? 'You' : nameOf(seat))
    expect(describeEvent({ type: 'seatReconnected', seat: 0 }, asYou, 0)).toBe('You are back')
  })

  it('leaves every other line untouched, since they are all past tense', () => {
    const asYou = (seat: number) => (seat === 0 ? 'You' : nameOf(seat))
    expect(describeEvent({ type: 'cardsDrawn', seat: 0, count: 1 }, asYou, 0)).toBe(
      'You drew a card',
    )
    expect(describeEvent({ type: 'unoCalled', seat: 0 }, asYou, 0)).toBe('You called UNO')
    expect(describeEvent({ type: 'seatDisconnected', seat: 0 }, asYou, 0)).toBe(
      'You lost connection',
    )
    expect(describeEvent({ type: 'seatLeft', seat: 0 }, asYou, 0)).toBe('You left the game')
  })

  it('pluralises drawn cards and penalties correctly', () => {
    expect(describeEvent({ type: 'unoPenalty', seat: 0, count: 1 }, nameOf, NOT_ME)).toContain(
      '1 card',
    )
    expect(describeEvent({ type: 'unoPenalty', seat: 0, count: 1 }, nameOf, NOT_ME)).not.toContain(
      '1 cards',
    )
    expect(describeEvent({ type: 'unoPenalty', seat: 0, count: 2 }, nameOf, NOT_ME)).toContain(
      '2 cards',
    )
  })

  it('describes a restart', () => {
    expect(describeEvent({ type: 'gameRestarted' }, nameOf, NOT_ME)).toBe('A new match was dealt')
  })

  it('falls back to a seat number for an unknown seat', () => {
    expect(describeEvent({ type: 'unoCalled', seat: 9 }, nameOf, NOT_ME)).toBe('Seat 9 called UNO')
  })
})
