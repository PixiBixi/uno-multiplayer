import type { ClientToServer, ErrorCode, MatchPace, ServerToClient } from '@uno/protocol'
import type { MatchGoal, Move } from '@uno/engine'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { readRoomCodeFromUrl, writeRoomCodeToUrl } from '../lib/room-url.js'
import { clearSession, readSession, writeSession } from '../lib/session.js'
import { gameReducer, initialState } from './game-reducer.js'

type TypedSocket = Socket<ServerToClient, ClientToServer>

/** Wording from the player's side of the screen: what happened, in their terms. */
const MESSAGES: Record<ErrorCode, string> = {
  room_not_found: 'No game with that code.',
  room_full: 'That game already has four players.',
  invalid_payload: 'That did not look right. Try again.',
  not_host: 'Only the host can do that.',
  too_few_players: 'A game needs at least two players.',
  game_already_started: 'That game is already under way.',
  game_not_started: 'The game has not started yet.',
  illegal_move: 'That card cannot be played right now.',
  not_your_turn: 'It is not your turn.',
  rate_limited: 'Slow down a moment.',
  invalid_session: 'Your seat was given away. Rejoin to play.',
  server_full: 'The server is at capacity. Try again shortly.',
  round_in_progress: 'This round is still being played.',
  match_over: 'The match is over. Start a new one to keep playing.',
}

export function useGameSocket() {
  const [state, dispatch] = useReducer(gameReducer, initialState)
  /* One socket for the app's lifetime, in a ref — never a module-level variable,
     which would leak between mounts and across two tabs of the same bundle. */
  const socketRef = useRef<TypedSocket | null>(null)

  useEffect(() => {
    const socket: TypedSocket = io({ transports: ['websocket', 'polling'] })
    socketRef.current = socket

    const onConnect = () => {
      dispatch({ type: 'connection', connection: 'open' })
      // A code in the URL plus a stored token means this is a return, not a first
      // visit: reclaim the seat before anything else.
      const code = readRoomCodeFromUrl()
      const token = code === null ? null : readSession(code)
      if (code === null || token === null) return
      socket.emit('room:rejoin', { roomCode: code, sessionToken: token }, (result) => {
        if (result.ok) dispatch({ type: 'joined', roomCode: code, seat: result.seat })
        else clearSession(code)
      })
    }
    const onDisconnect = () => dispatch({ type: 'connection', connection: 'lost' })
    const onLobby: ServerToClient['room:state'] = (lobby) => dispatch({ type: 'lobby', lobby })
    const onView: ServerToClient['game:view'] = (view) => dispatch({ type: 'view', view })
    const onEvent: ServerToClient['game:event'] = (event) => dispatch({ type: 'event', event })
    const onChat: ServerToClient['chat:message'] = (message) => dispatch({ type: 'chat', message })
    const onError: ServerToClient['error'] = ({ code }) =>
      dispatch({ type: 'error', message: MESSAGES[code] })

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('room:state', onLobby)
    socket.on('game:view', onView)
    socket.on('game:event', onEvent)
    socket.on('chat:message', onChat)
    socket.on('error', onError)

    return () => {
      /* Named removals, then a real disconnect. `socket.off()` with no argument
         would also strip socket.io's own internal listeners. */
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room:state', onLobby)
      socket.off('game:view', onView)
      socket.off('game:event', onEvent)
      socket.off('chat:message', onChat)
      socket.off('error', onError)
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  const fail = useCallback((code: ErrorCode) => {
    dispatch({ type: 'error', message: MESSAGES[code] })
  }, [])

  const createRoom = useCallback(
    (playerName: string, goal: MatchGoal, pace: MatchPace) => {
      socketRef.current?.emit('room:create', { playerName, goal, pace }, (result) => {
        if (!result.ok) {
          fail(result.error)
          return
        }
        writeSession(result.roomCode, result.sessionToken)
        writeRoomCodeToUrl(result.roomCode)
        dispatch({ type: 'joined', roomCode: result.roomCode, seat: result.seat })
      })
    },
    [fail],
  )

  const joinRoom = useCallback(
    (roomCode: string, playerName: string) => {
      socketRef.current?.emit('room:join', { roomCode, playerName }, (result) => {
        if (!result.ok) {
          fail(result.error)
          return
        }
        writeSession(roomCode, result.sessionToken)
        writeRoomCodeToUrl(roomCode)
        dispatch({ type: 'joined', roomCode, seat: result.seat })
      })
    },
    [fail],
  )

  const startGame = useCallback(() => {
    socketRef.current?.emit('game:start', {}, (result) => {
      if (!result.ok) fail(result.error)
    })
  }, [fail])

  const nextRound = useCallback(() => {
    socketRef.current?.emit('game:nextRound', {}, (result) => {
      if (!result.ok) fail(result.error)
    })
  }, [fail])

  const restartGame = useCallback(() => {
    socketRef.current?.emit('game:restart', {}, (result) => {
      if (!result.ok) fail(result.error)
    })
  }, [fail])

  const playMove = useCallback(
    (move: Move) => {
      socketRef.current?.emit('game:move', { move }, (result) => {
        if (!result.ok) fail(result.error)
      })
    },
    [fail],
  )

  const sendChat = useCallback(
    (text: string) => {
      socketRef.current?.emit('chat:send', { text }, (result) => {
        if (!result.ok) fail(result.error)
      })
    },
    [fail],
  )

  const roomCode = state.roomCode
  const leave = useCallback(() => {
    if (roomCode !== null) clearSession(roomCode)
    dispatch({ type: 'left' })
  }, [roomCode])

  const dismissToast = useCallback((id: number) => {
    dispatch({ type: 'dismissToast', id })
  }, [])

  return {
    state,
    actions: {
      createRoom,
      joinRoom,
      startGame,
      nextRound,
      restartGame,
      playMove,
      sendChat,
      leave,
      dismissToast,
    },
  }
}
