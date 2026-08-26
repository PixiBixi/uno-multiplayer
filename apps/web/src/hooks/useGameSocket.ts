import type { ClientToServer, ErrorCode, ServerToClient, TableConfiguration } from '@uno/protocol'
import { DEFAULT_MATCH_GOAL } from '@uno/protocol'
import { DEFAULT_TABLE_RULES, type Move } from '@uno/engine'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { readRoomCodeFromUrl, writeRoomCodeToUrl } from '../lib/room-url.js'
import { clearSession, readSession, writeSession } from '../lib/session.js'
import { useMessages } from '../i18n/index.js'
import { gameReducer, initialState, type Action, type ClientState } from './game-reducer.js'

type TypedSocket = Socket<ServerToClient, ClientToServer>

export function useGameSocket() {
  const messages = useMessages()

  /* The catalogue reaches the reducer as an argument rather than through a context
     the reducer cannot see. Rebuilding this closure when the language changes is
     the point: the next toast is written in the language chosen a moment ago. */
  const reduce = useCallback(
    (state: ClientState, action: Action): ClientState => gameReducer(state, action, messages),
    [messages],
  )
  const [state, dispatch] = useReducer(reduce, initialState)
  /* One socket for the app's lifetime, in a ref - never a module-level variable,
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
      dispatch({ type: 'error', message: messagesRef.current.error[code] })

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

  /* Read through a ref rather than closed over, so switching language does not
     rebuild every action callback and re-register the socket listeners. */
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const fail = useCallback((code: ErrorCode) => {
    dispatch({ type: 'error', message: messagesRef.current.error[code] })
  }, [])

  /**
   * Creates a table on the defaults, which is all the home screen collects now.
   *
   * The payload keeps its `goal`, `pace` and `rules` fields even though this always sends
   * the defaults: they are already validated and already tested, and dropping them would
   * break a client mid-deploy for no gain. The host changes any of them from the lobby.
   */
  /*
   * One create at a time, guarded here rather than in the button.
   *
   * A second tap while the first is unanswered opens a second table and abandons the
   * first - harmless to the player, who lands somewhere, and not harmless to the server,
   * which held that room until a fix landed. On a phone the acknowledgement is 300 ms
   * away, which is exactly long enough for an impatient thumb.
   *
   * The flag lives with the emit because this is where the acknowledgement arrives, so it
   * clears on every outcome including a refusal. A disabled button cannot do that: `Home`
   * never learns the call finished, so it would either stay stuck when a reply is lost or
   * need a timer of its own guessing when to give up.
   */
  const creating = useRef(false)

  const createRoom = useCallback(
    (playerName: string) => {
      if (creating.current) return
      creating.current = true
      socketRef.current?.emit(
        'room:create',
        { playerName, goal: DEFAULT_MATCH_GOAL, pace: null, rules: DEFAULT_TABLE_RULES },
        (result) => {
          creating.current = false
          if (!result.ok) {
            fail(result.error)
            return
          }
          writeSession(result.roomCode, result.sessionToken)
          writeRoomCodeToUrl(result.roomCode)
          dispatch({ type: 'joined', roomCode: result.roomCode, seat: result.seat })
        },
      )
    },
    [fail],
  )

  /**
   * The host changing the table from the lobby.
   *
   * Nothing is dispatched on success. The server answers by broadcasting `room:state` to
   * every member - which is the only way a guest sees the change at all - so writing the
   * new value into local state here would be a second source of truth for something the
   * server is still free to refuse.
   */
  const configureRoom = useCallback(
    (changes: TableConfiguration) => {
      socketRef.current?.emit('room:configure', changes, (result) => {
        if (!result.ok) fail(result.error)
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
    // Told to the server first: without this the seat keeps a dead socket id and
    // the room can never be reclaimed.
    socketRef.current?.emit('room:leave', {}, () => undefined)
    if (roomCode !== null) clearSession(roomCode)
    dispatch({ type: 'left' })
  }, [roomCode])

  const dismissToast = useCallback((id: number) => {
    dispatch({ type: 'dismissToast', id })
  }, [])

  return {
    state,
    /* Handed out so voice can ride the same socket: the server resolves a voice
       member through this socket's presence. A ref, because it is created inside
       an effect and is null on the first render. */
    socketRef,
    actions: {
      createRoom,
      configureRoom,
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
