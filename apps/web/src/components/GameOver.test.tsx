import type { Card, CardId } from '@uno/engine'
import type { PlayerView } from '@uno/protocol'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GameOver } from './GameOver.js'

const top: Card = { id: 't' as CardId, kind: 'number', color: 'R', value: 3 }
const nameOf = (seat: number) => ['You', 'Ben', 'Cleo'][seat] ?? `Seat ${seat}`

const finished = (winner: number | null): PlayerView => ({
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
})

describe('GameOver', () => {
  it('names the winner', () => {
    render(
      <GameOver view={finished(2)} nameOf={nameOf} isHost onRestart={vi.fn()} onLeave={vi.fn()} />,
    )
    expect(screen.getByRole('heading', { name: /cleo wins/i })).toBeTruthy()
  })

  it('lists final counts, lowest first', () => {
    render(
      <GameOver view={finished(2)} nameOf={nameOf} isHost onRestart={vi.fn()} onLeave={vi.fn()} />,
    )
    const rows = screen.getAllByRole('listitem').map((row) => row.textContent ?? '')
    expect(rows[0]).toMatch(/cleo/i)
    expect(rows[rows.length - 1]).toMatch(/ben/i)
  })

  it('says the game was abandoned when there is no winner, with no standings', () => {
    render(
      <GameOver
        view={finished(null)}
        nameOf={nameOf}
        isHost={false}
        onRestart={vi.fn()}
        onLeave={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: /abandoned/i })).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('offers a restart to the host', async () => {
    const onRestart = vi.fn()
    render(
      <GameOver
        view={finished(2)}
        nameOf={nameOf}
        isHost
        onRestart={onRestart}
        onLeave={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /play again/i }))
    expect(onRestart).toHaveBeenCalledTimes(1)
  })

  it('tells a guest who can restart instead of showing a dead button', () => {
    render(
      <GameOver
        view={finished(2)}
        nameOf={nameOf}
        isHost={false}
        onRestart={vi.fn()}
        onLeave={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /play again/i })).toBeNull()
    expect(screen.getByText(/host/i)).toBeTruthy()
  })

  it('can always leave', async () => {
    const onLeave = vi.fn()
    render(
      <GameOver
        view={finished(null)}
        nameOf={nameOf}
        isHost
        onRestart={vi.fn()}
        onLeave={onLeave}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /leave/i }))
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('never reveals anybody’s cards, only counts', () => {
    const { container } = render(
      <GameOver view={finished(2)} nameOf={nameOf} isHost onRestart={vi.fn()} onLeave={vi.fn()} />,
    )
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(0)
  })
})
