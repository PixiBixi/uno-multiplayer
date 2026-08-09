import { Component, type ContextType, type ErrorInfo, type ReactNode } from 'react'
import { LocaleContext } from '../i18n/index.js'
import { readRoomCodeFromUrl } from '../lib/room-url.js'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { failed: boolean }

/**
 * The last line of defence. React unmounts the entire tree when a component
 * throws, so without this a single bad render replaces the game with a blank
 * page — which is exactly what a server running an older build once produced
 * here: a view arrived without the field the scoreboard reads, and the table
 * vanished with no explanation.
 *
 * A class, because that is still the only way to catch a render error. Everything
 * else in the app is a function component.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  /* A class component reads context through this static, which is the only way
     to translate a screen that exists because everything else broke. */
  static override contextType = LocaleContext
  declare context: ContextType<typeof LocaleContext>

  override state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept for whoever opens the console next: React's own message says which
    // component, this says what and where.
    console.error('The table stopped rendering', error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children

    /* Read from the address bar rather than from game state, which is precisely
       what cannot be trusted at this point. It is also still correct: the lobby
       wrote the code there when the table was created or joined. */
    const roomCode = readRoomCodeFromUrl()
    const t = this.context.messages

    return (
      <main className="home">
        <h1>UNO</h1>
        <p className="banner banner-bad" role="alert">
          {t.crash.heading}
        </p>
        <p className="hint">{t.crash.seatHeld}</p>
        {roomCode !== null && (
          <div className="stack">
            <span className="eyebrow">{t.lobby.gameCodeLabel}</span>
            <p className="code-display">{roomCode}</p>
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            window.location.reload()
          }}
        >
          {t.crash.reload}
        </button>
      </main>
    )
  }
}
