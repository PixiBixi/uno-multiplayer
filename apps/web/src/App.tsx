import { Toaster } from './components/Toaster.js'
import { useGameSocket } from './hooks/useGameSocket.js'
import { readRoomCodeFromUrl } from './lib/room-url.js'
import { Home } from './screens/Home.js'
import { Lobby } from './screens/Lobby.js'
import { Table } from './screens/Table.js'

/**
 * The screen is a function of what the server pushed. There is no client-side
 * navigation state that could fall out of step with the game.
 */
export function App() {
  const { state, actions } = useGameSocket()

  if (state.connection === 'lost') {
    return (
      <main className="home">
        <h1>UNO</h1>
        <p className="banner banner-bad" role="alert">
          Connection lost. Trying to reconnect…
        </p>
      </main>
    )
  }

  if (state.screen === 'table' && state.view !== null) {
    return (
      <Table
        view={state.view}
        lobby={state.lobby}
        feed={state.feed}
        toasts={state.toasts}
        onPlay={actions.playMove}
        onNextRound={actions.nextRound}
        onRestart={actions.restartGame}
        onLeave={actions.leave}
        onSend={actions.sendChat}
        onDismissToast={actions.dismissToast}
      />
    )
  }

  if (state.screen === 'lobby' && state.lobby !== null && state.seat !== null) {
    return (
      <>
        <Lobby
          lobby={state.lobby}
          mySeat={state.seat}
          onStart={actions.startGame}
          onLeave={actions.leave}
        />
        <Toaster toasts={state.toasts} onDismiss={actions.dismissToast} />
      </>
    )
  }

  return (
    <Home
      onCreate={actions.createRoom}
      onJoin={actions.joinRoom}
      error={state.error}
      prefilledCode={readRoomCodeFromUrl()}
    />
  )
}
