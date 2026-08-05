import type { Move } from '@uno/engine'
import type { LobbyView, PlayerView } from '@uno/protocol'
import { useCallback, useState } from 'react'
import { CentreStack } from '../components/CentreStack.js'
import { ChatPanel } from '../components/ChatPanel.js'
import { GameOver } from '../components/GameOver.js'
import { Hand } from '../components/Hand.js'
import { PlayEffects } from '../components/PlayEffects.js'
import { Seat } from '../components/Seat.js'
import { Toaster } from '../components/Toaster.js'
import type { FeedEntry, Toast } from '../hooks/game-reducer.js'

type TableProps = {
  view: PlayerView
  lobby: LobbyView | null
  feed: FeedEntry[]
  toasts: Toast[]
  onPlay: (move: Move) => void
  onRestart: () => void
  onLeave: () => void
  onSend: (text: string) => void
  onDismissToast: (id: number) => void
}

/**
 * Seats are laid out relative to the viewer: your hand is always at the bottom
 * edge. The engine keeps seat numbers stable, so the client rotates the
 * arrangement rather than the data.
 */
const AREAS = ['west', 'north', 'east'] as const

export function Table({
  view,
  lobby,
  feed,
  toasts,
  onPlay,
  onRestart,
  onLeave,
  onSend,
  onDismissToast,
}: TableProps) {
  const myTurn = view.currentSeat === view.you.seat
  const canDraw = view.you.legalMoves.some((move) => move.type === 'draw')
  const acceptDraw = view.you.legalMoves.find((move) => move.type === 'acceptDraw')
  const canCallUno = view.you.legalMoves.some((move) => move.type === 'callUno')

  const nameOf = (seat: number): string => {
    if (seat === view.you.seat) return 'You'
    const opponent = view.opponents.find((candidate) => candidate.seat === seat)
    if (opponent !== undefined) return opponent.name
    return lobby?.seats.find((candidate) => candidate.seat === seat)?.name ?? `Seat ${String(seat)}`
  }

  const isHost = lobby !== null && lobby.hostSeat === view.you.seat

  // Lifted out of PlayEffects rather than computed independently here: it is
  // the single source of truth for "a wild4 burst is currently live", and the
  // table itself — not just the burst overlay — is what shakes.
  const [shaking, setShaking] = useState(false)
  const handleShake = useCallback((value: boolean) => {
    setShaking(value)
  }, [])

  return (
    <main className="table-screen">
      <div className={shaking ? 'table-surface fx-shake' : 'table-surface'}>
        <PlayEffects
          discardTop={view.discardTop}
          currentColor={view.currentColor}
          onShake={handleShake}
        />
        <div className="table-grid">
          {view.opponents.slice(0, 3).map((opponent, index) => (
            <div className={`area-${AREAS[index] ?? 'north'}`} key={opponent.seat}>
              <Seat
                name={opponent.name}
                handCount={opponent.handCount}
                status={opponent.status}
                isTurn={view.currentSeat === opponent.seat}
                orientation={index === 1 ? 'horizontal' : 'vertical'}
              />
            </div>
          ))}

          <div className="area-centre">
            <CentreStack view={view} />
          </div>

          <div className="area-south">
            <div className="controls">
              {acceptDraw !== undefined ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    onPlay(acceptDraw)
                  }}
                >
                  Take {view.pendingDraw?.amount ?? 0}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  disabled={!canDraw}
                  onClick={() => {
                    onPlay({ type: 'draw' })
                  }}
                >
                  Draw card
                </button>
              )}
              {/* The UNO control only exists when calling it is a legal move. */}
              {canCallUno && (
                <button
                  type="button"
                  className="btn btn-uno"
                  onClick={() => {
                    onPlay({ type: 'callUno' })
                  }}
                >
                  UNO!
                </button>
              )}
            </div>

            <Hand cards={view.you.hand} legalMoves={view.you.legalMoves} onPlay={onPlay} />

            <p className={myTurn ? 'plate plate-turn' : 'plate'}>
              <span className="presence presence-active" aria-hidden="true" />
              <span>You</span>
              <span className="plate-count">{view.you.hand.length}</span>
              {myTurn && <span className="plate-note">your turn</span>}
            </p>
          </div>
        </div>

        {view.phase === 'finished' && (
          <GameOver
            view={view}
            nameOf={nameOf}
            isHost={isHost}
            onRestart={onRestart}
            onLeave={onLeave}
          />
        )}
      </div>

      <ChatPanel feed={feed} mySeat={view.you.seat} nameOf={nameOf} onSend={onSend} />
      <Toaster toasts={toasts} onDismiss={onDismissToast} />
    </main>
  )
}
