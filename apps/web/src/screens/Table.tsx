import type { Move } from '@uno/engine'
import type { LobbyView, PlayerView } from '@uno/protocol'
import { CentreStack } from '../components/CentreStack.js'
import { ChatPanel } from '../components/ChatPanel.js'
import { GameOver } from '../components/GameOver.js'
import { Hand } from '../components/Hand.js'
import { PlayEffects } from '../components/PlayEffects.js'
import { Seat } from '../components/Seat.js'
import { Toaster } from '../components/Toaster.js'
import type { FeedEntry, Toast } from '../hooks/game-reducer.js'
import { useTableEffects } from '../hooks/useTableEffects.js'
import { useTableSounds } from '../hooks/useTableSounds.js'

type TableProps = {
  view: PlayerView
  lobby: LobbyView | null
  feed: FeedEntry[]
  toasts: Toast[]
  onPlay: (move: Move) => void
  onNextRound: () => void
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
  onNextRound,
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

  /* One hook owns every flourish: the burst overlay, the table shake and the
     draw-pile pulse each land in a different part of the tree below, but the
     "what have I already reacted to" bookkeeping stays in a single place. */
  const { effects, shaking, drawNonce } = useTableEffects({
    discardTop: view.discardTop,
    currentColor: view.currentColor,
    feed,
  })

  /* Sound is a separate hook rather than part of the one above, because it reads
     a different source: the feed alone, since a cue needs the card's kind and not
     the colour chosen for a wild. */
  const { muted, toggleMuted } = useTableSounds({ feed, isMyTurn: myTurn, mySeat: view.you.seat })

  return (
    <main className="table-screen">
      <div className={shaking ? 'table-surface fx-shake' : 'table-surface'}>
        <PlayEffects effects={effects} />
        <button
          type="button"
          className="sound-toggle"
          onClick={toggleMuted}
          aria-pressed={muted}
          aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          title={muted ? 'Unmute sound' : 'Mute sound'}
        >
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            {muted ? (
              <path d="m16 9 5 6m0-6-5 6" />
            ) : (
              <>
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M18.5 5.5a9 9 0 0 1 0 13" />
              </>
            )}
          </svg>
        </button>
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
            <CentreStack view={view} drawNonce={drawNonce} />
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
            onNextRound={onNextRound}
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
