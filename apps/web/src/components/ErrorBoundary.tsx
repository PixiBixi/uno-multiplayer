import { Component, type ErrorInfo, type ReactNode } from 'react'
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

    return (
      <main className="home">
        <h1>UNO</h1>
        <p className="banner banner-bad" role="alert">
          Something in the table stopped working.
        </p>
        <p className="hint">
          Your seat is still held. Reloading rejoins the same game — the server keeps the state, so
          nothing is lost but this screen.
        </p>
        {roomCode !== null && (
          <div className="stack">
            <span className="eyebrow">Game code</span>
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
          Reload and rejoin
        </button>
      </main>
    )
  }
}
