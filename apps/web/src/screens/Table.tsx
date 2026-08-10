import type { Move } from '@uno/engine'
import type { LobbyView, PlayerView } from '@uno/protocol'
import { CentreStack } from '../components/CentreStack.js'
import { useCardTheme, useSetCardTheme } from '../components/CardThemeProvider.js'
import { ChatPanel } from '../components/ChatPanel.js'
import { GameOver } from '../components/GameOver.js'
import { Hand } from '../components/Hand.js'
import { PlayEffects } from '../components/PlayEffects.js'
import { Seat } from '../components/Seat.js'
import { Toaster } from '../components/Toaster.js'
import type { FeedEntry, Toast } from '../hooks/game-reducer.js'
import { useTableEffects } from '../hooks/useTableEffects.js'
import { useCountdown } from '../hooks/useCountdown.js'
import { useTableSounds } from '../hooks/useTableSounds.js'
import { nextCardTheme } from '../lib/card-themes.js'
import { useMessages } from '../i18n/index.js'

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
  const t = useMessages()
  const cardTheme = useCardTheme()
  const setCardTheme = useSetCardTheme()
  const myTurn = view.currentSeat === view.you.seat
  const canDraw = view.you.legalMoves.some((move) => move.type === 'draw')
  const acceptDraw = view.you.legalMoves.find((move) => move.type === 'acceptDraw')
  const canCallUno = view.you.legalMoves.some((move) => move.type === 'callUno')
  /* A pass is offered only while this seat is holding a card it has just drawn and may
     still lay down, which is the one moment a turn does not end by itself. Read from
     `legalMoves` like everything else here: the client is told, never works it out. */
  const canPass = view.you.legalMoves.some((move) => move.type === 'pass')
  /* A play offered while it is somebody else's turn can only be a jump-in — the
     server offers an off-turn seat call-outs and jump-ins and nothing else. Purely a
     label: the card is clickable because the move is in the view, not because of this
     line, and without it the chance is invisible unless you notice a card light up
     during another player's turn. */
  const canJumpIn = !myTurn && view.you.legalMoves.some((move) => move.type === 'play')

  /* The one move that is legal off turn, and the client still evaluates nothing:
     an opponent gets a Liar button only because the server put a call-out against
     that exact seat in this view. */
  const callOutAgainst = (seat: number): Move | undefined =>
    view.you.legalMoves.find((move) => move.type === 'callOut' && move.target === seat)

  const nameOf = (seat: number): string => {
    if (seat === view.you.seat) return t.table.you
    const opponent = view.opponents.find((candidate) => candidate.seat === seat)
    if (opponent !== undefined) return opponent.name
    return lobby?.seats.find((candidate) => candidate.seat === seat)?.name ?? t.table.seat(seat)
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

  // Null on a table with no clock, which is what keeps Blazing opt-in.
  const secondsLeft = useCountdown(view.turnDeadline)

  return (
    <main className="table-screen">
      <div className={shaking ? 'table-surface fx-shake' : 'table-surface'}>
        <PlayEffects effects={effects} />
        <button
          type="button"
          className="sound-toggle"
          onClick={toggleMuted}
          aria-pressed={muted}
          aria-label={muted ? t.table.unmuteSound : t.table.muteSound}
          title={muted ? t.table.unmuteSound : t.table.muteSound}
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
        {/* Beside the mute toggle for the same reason it is: a card face is a
            setting, not a move, and it must not sit among the buttons a player
            reaches for with a clock running. A cycler rather than four options,
            because there is no room on the felt for four and the previews on the
            home screen are where you choose by looking. */}
        <button
          type="button"
          className="theme-cycler"
          onClick={() => {
            setCardTheme(nextCardTheme(cardTheme))
          }}
          aria-label={t.cardTheme.named(t.cardTheme.name[cardTheme])}
          title={t.cardTheme.named(t.cardTheme.name[cardTheme])}
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
            <rect x={3} y={6} width={11} height={15} rx={2} />
            <path d="M8 3h9a2 2 0 0 1 2 2v12" />
          </svg>
        </button>
        <div className="table-grid">
          {view.opponents.slice(0, 3).map((opponent, index) => {
            const callOut = callOutAgainst(opponent.seat)
            return (
              <div className={`area-${AREAS[index] ?? 'north'}`} key={opponent.seat}>
                <Seat
                  name={opponent.name}
                  handCount={opponent.handCount}
                  status={opponent.status}
                  isTurn={view.currentSeat === opponent.seat}
                  orientation={index === 1 ? 'horizontal' : 'vertical'}
                  onCallOut={
                    callOut === undefined
                      ? null
                      : () => {
                          onPlay(callOut)
                        }
                  }
                />
              </div>
            )
          })}

          <div className="area-centre">
            <CentreStack view={view} drawNonce={drawNonce} />
            {secondsLeft !== null && (
              /* A live region so the number is announced as it falls, and urgent
                 only at the end — a polite update every second would queue up
                 behind itself in a screen reader. */
              <p
                className={secondsLeft <= 3 ? 'turn-clock turn-clock-urgent' : 'turn-clock'}
                role="status"
                aria-live={secondsLeft <= 3 ? 'assertive' : 'off'}
              >
                <span className="turn-clock-number">{secondsLeft}</span>
                <span className="turn-clock-label">
                  {myTurn ? t.table.secondsToPlay : t.table.secondsLeft}
                </span>
              </p>
            )}
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
                  {t.table.take(view.pendingDraw?.amount ?? 0)}
                </button>
              ) : canPass ? (
                /* In the place the draw button occupies the rest of the time, because it is
                   the same thing at this moment: the action that gets you out of your turn.
                   A disabled Draw beside it would be the only control on screen and would
                   read as a table that has stopped responding. Primary, since it is one of
                   exactly two things this seat may now do. */
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    onPlay({ type: 'pass' })
                  }}
                >
                  {t.table.endTurn}
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
                  {t.table.drawCard}
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
                  {t.table.callUno}
                </button>
              )}
            </div>

            {/* Says which two things are on offer, because neither is obvious from the
                felt: the drawn card lights up among cards that no longer do, and the only
                other control has just changed what it says. A player who reads nothing and
                sees no move concludes the table has hung. */}
            {canPass && (
              <p className="drawn-prompt" role="status">
                {t.table.playDrawnCard}
              </p>
            )}

            {/* `opponents` is exactly what the swap picker needs to name a seat, so
                it is passed through rather than rebuilt. */}
            <Hand
              cards={view.you.hand}
              legalMoves={view.you.legalMoves}
              onPlay={onPlay}
              targets={view.opponents}
            />

            <p className={myTurn ? 'plate plate-turn' : 'plate'}>
              <span className="presence presence-active" aria-hidden="true" />
              <span>{t.table.you}</span>
              <span className="plate-count">{view.you.hand.length}</span>
              {myTurn && <span className="plate-note">{t.table.yourTurn}</span>}
              {canJumpIn && <span className="plate-note plate-note-jump">{t.table.jumpIn}</span>}
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
