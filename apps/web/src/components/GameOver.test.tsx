import type { Card, CardId, MatchGoal } from '@uno/engine'
import type { PlayerView } from '@uno/protocol'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GameOver } from './GameOver.js'

const top: Card = { id: 't' as CardId, kind: 'number', color: 'R', value: 3 }
const nameOf = (seat: number) => ['You', 'Ben', 'Cleo'][seat] ?? `Seat ${seat}`

type MatchBits = {
  goal?: MatchGoal
  scores?: number[]
  round?: number
  winners?: number[] | null
}

const finished = (winner: number | null, match: MatchBits = {}): PlayerView => ({
  you: { seat: 0, hand: [top, top], legalMoves: [] },
  opponents: [
    { seat: 1, name: 'Ben', handCount: 5, status: 'active' },
    { seat: 2, name: 'Cleo', handCount: 0, status: 'active' },
  ],
  discardTop: top,
  currentColor: 'R',
  pendingDraw: null,
  currentSeat: 0,
  direction: 1,
  drawPileCount: 10,
  phase: 'finished',
  winner,
  turnDeadline: null,
  nextRoundDeadline: null,
  match: {
    goal: match.goal ?? { kind: 'points', target: 500 },
    scores: match.scores ?? [0, 0, 0],
    round: match.round ?? 2,
    winners: match.winners ?? null,
  },
})

const setup = (view: PlayerView, isHost = true) => {
  const props = {
    view,
    nameOf,
    isHost,
    onNextRound: vi.fn(),
    onRestart: vi.fn(),
    onLeave: vi.fn(),
  }
  render(<GameOver {...props} />)
  return props
}

describe('GameOver between rounds', () => {
  it('says who won the round, not the match', () => {
    setup(finished(2, { scores: [0, 30, 120] }))
    expect(screen.getByRole('heading', { name: /cleo wins the round/i })).toBeTruthy()
  })

  it('lists the running standings, highest first', () => {
    setup(finished(2, { scores: [10, 200, 120] }))
    const rows = screen.getAllByRole('listitem').map((row) => row.textContent ?? '')
    expect(rows[0]).toMatch(/ben/i)
    expect(rows[rows.length - 1]).toMatch(/you/i)
  })

  it('offers the host another round, with a new match as the quieter option', async () => {
    const { onNextRound, onRestart } = setup(finished(2))
    await userEvent.click(screen.getByRole('button', { name: /next round/i }))
    expect(onNextRound).toHaveBeenCalledTimes(1)
    expect(onRestart).not.toHaveBeenCalled()
  })

  it('tells a guest what they are waiting for', () => {
    setup(finished(2), false)
    expect(screen.queryByRole('button', { name: /next round/i })).toBeNull()
    expect(screen.getByText(/waiting for the host to deal the next round/i)).toBeTruthy()
  })

  it('names the target, so the standings mean something', () => {
    setup(finished(2, { goal: { kind: 'points', target: 250 } }))
    expect(screen.getByText(/first to 250 points/i)).toBeTruthy()
  })

  it('counts the rounds in rounds mode', () => {
    setup(finished(2, { goal: { kind: 'rounds', count: 3 }, round: 2 }))
    expect(screen.getByText(/round 2 of 3/i)).toBeTruthy()
  })
})

describe('GameOver at the end of a match', () => {
  it('declares the match winner', () => {
    setup(finished(1, { scores: [120, 510, 60], winners: [1] }))
    expect(screen.getByRole('heading', { name: /ben wins the match/i })).toBeTruthy()
  })

  it('uses the second person for your own win', () => {
    setup(finished(0, { scores: [510, 120, 60], winners: [0] }))
    expect(screen.getByRole('heading', { name: /you win the match/i })).toBeTruthy()
  })

  it('reports a tie rather than picking a winner', () => {
    // Only reachable in rounds mode, and the official rules say nothing about it.
    setup(
      finished(1, {
        goal: { kind: 'rounds', count: 3 },
        scores: [90, 200, 200],
        winners: [1, 2],
      }),
    )
    expect(screen.getByRole('heading', { name: /ben and cleo tie the match/i })).toBeTruthy()
  })

  it('stops offering another round once the match is decided', async () => {
    const { onRestart } = setup(finished(1, { winners: [1] }))
    expect(screen.queryByRole('button', { name: /next round/i })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /new match/i }))
    expect(onRestart).toHaveBeenCalledTimes(1)
  })
})

describe('GameOver on an abandoned round', () => {
  it('says there is no winner', () => {
    setup(finished(null))
    expect(screen.getByRole('heading', { name: /round abandoned/i })).toBeTruthy()
    expect(screen.getByText(/needs two players/i)).toBeTruthy()
  })

  it('can still leave', async () => {
    const { onLeave } = setup(finished(null))
    await userEvent.click(screen.getByRole('button', { name: /leave table/i }))
    expect(onLeave).toHaveBeenCalledTimes(1)
  })
})
