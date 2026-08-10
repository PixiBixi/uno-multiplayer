import type { Card, CardId } from '@uno/engine'
import type { GameEvent } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { soundForCard, soundForEvent, soundsForEvents } from './sounds.js'

const num = (value: 0 | 5): Card => ({ id: 'n' as CardId, kind: 'number', color: 'R', value })
const act = (kind: 'skip' | 'reverse' | 'draw2'): Card => ({ id: 'a' as CardId, kind, color: 'G' })
const wild = (kind: 'wild' | 'wild4'): Card => ({ id: 'w' as CardId, kind })

const played = (card: Card): GameEvent => ({ type: 'cardPlayed', seat: 0, card })

describe('soundForCard', () => {
  it('gives every number card the same quiet cue', () => {
    // Dozens of these a round: a distinct sound per value would be exhausting.
    expect(soundForCard(num(0))).toBe('play')
    expect(soundForCard(num(5))).toBe('play')
  })

  it('gives each action card its own', () => {
    expect(soundForCard(act('skip'))).toBe('skip')
    expect(soundForCard(act('reverse'))).toBe('reverse')
    expect(soundForCard(act('draw2'))).toBe('draw2')
    expect(soundForCard(wild('wild'))).toBe('wild')
    expect(soundForCard(wild('wild4'))).toBe('wild4')
  })
})

describe('soundForEvent', () => {
  it('sounds a played card by its kind', () => {
    expect(soundForEvent(played(wild('wild4')), 0)).toBe('wild4')
    expect(soundForEvent(played(num(5)), 0)).toBe('play')
  })

  it('sounds a draw the same way however it was earned', () => {
    expect(soundForEvent({ type: 'cardsDrawn', seat: 1, count: 1 }, 0)).toBe('draw')
    expect(soundForEvent({ type: 'unoPenalty', seat: 1, count: 2 }, 0)).toBe('draw')
  })

  it('sounds a UNO call', () => {
    expect(soundForEvent({ type: 'unoCalled', seat: 0 }, 0)).toBe('uno')
  })

  it('sounds a call-out with the same cue as the call it punishes', () => {
    /* Reusing the UNO cue rather than inventing a sound: the two moments belong to
       the same rule, and the cards it costs already arrive as a separate `draw`. */
    expect(soundForEvent({ type: 'calledOut', by: 1, target: 0 }, 0)).toBe('uno')
  })

  it('tells winning a round apart from watching one be won', () => {
    const ended: GameEvent = { type: 'roundEnded', winner: 0, awarded: [30, 0], scores: [30, 0] }
    expect(soundForEvent(ended, 0)).toBe('roundWon')
    expect(soundForEvent(ended, 1)).toBe('roundOver')
  })

  it('tells winning the match apart from losing it', () => {
    const ended: GameEvent = { type: 'matchEnded', winners: [0], scores: [510, 90] }
    expect(soundForEvent(ended, 0)).toBe('matchWon')
    expect(soundForEvent(ended, 1)).toBe('matchOver')
  })

  it('counts a shared win as yours', () => {
    const tied: GameEvent = { type: 'matchEnded', winners: [0, 2], scores: [200, 90, 200] }
    expect(soundForEvent(tied, 2)).toBe('matchWon')
    expect(soundForEvent(tied, 1)).toBe('matchOver')
  })

  it('stays silent for what the log already says in words', () => {
    const quiet: GameEvent[] = [
      { type: 'seatDisconnected', seat: 1 },
      { type: 'seatReconnected', seat: 1 },
      { type: 'seatLeft', seat: 1 },
      { type: 'roundStarted', round: 2 },
      { type: 'gameRestarted' },
    ]
    for (const event of quiet) expect(soundForEvent(event, 0)).toBeNull()
  })
})

describe('soundsForEvents', () => {
  it('keeps the order the events arrived in', () => {
    expect(
      soundsForEvents([played(act('draw2')), { type: 'cardsDrawn', seat: 1, count: 2 }], 0),
    ).toEqual(['draw2', 'draw'])
  })

  it('drops the silent ones rather than leaving gaps', () => {
    expect(soundsForEvents([{ type: 'seatLeft', seat: 1 }, played(num(5))], 0)).toEqual(['play'])
  })

  it('plays only the bigger ending when a round ends the match', () => {
    /* The server emits roundEnded immediately followed by matchEnded, so playing
       both would stack two fanfares on top of each other. */
    expect(
      soundsForEvents(
        [
          { type: 'roundEnded', winner: 0, awarded: [80, 0], scores: [510, 0] },
          { type: 'matchEnded', winners: [0], scores: [510, 0] },
        ],
        0,
      ),
    ).toEqual(['matchWon'])
  })

  it('still plays the round ending when the match continues', () => {
    expect(
      soundsForEvents([{ type: 'roundEnded', winner: 0, awarded: [20, 0], scores: [20, 0] }], 1),
    ).toEqual(['roundOver'])
  })

  it('has nothing to say about an empty batch', () => {
    expect(soundsForEvents([], 0)).toEqual([])
  })
})
