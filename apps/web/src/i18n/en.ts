import type { Card } from '@uno/engine'
import type { Messages } from './messages.js'

const COLOUR: Record<'R' | 'G' | 'B' | 'Y', string> = {
  R: 'Red',
  G: 'Green',
  B: 'Blue',
  Y: 'Yellow',
}

const cardName = (card: Card): string => {
  switch (card.kind) {
    case 'number':
      return `${COLOUR[card.color]} ${String(card.value)}`
    case 'skip':
      return `${COLOUR[card.color]} skip`
    case 'reverse':
      return `${COLOUR[card.color]} reverse`
    case 'draw2':
      return `${COLOUR[card.color]} draw two`
    case 'wild':
      return 'Wild'
    case 'wild4':
      return 'Wild draw four'
  }
}

const cards = (n: number) => (n === 1 ? '1 card' : `${String(n)} cards`)
const points = (n: number) => (n === 1 ? '1 point' : `${String(n)} points`)

const list = (names: string[]): string => {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`
}

export const en: Messages = {
  card: cardName,
  colour: (colour) => COLOUR[colour],
  cardTheme: {
    label: 'Card theme',
    named: (name) => `Card theme: ${name}`,
    name: {
      classic: 'Classic',
      flat: 'Flat',
      letterpress: 'Letterpress',
      neon: 'Neon',
    },
  },
  count: { cards, points, list },

  /* English keeps one form for both persons in these, so the `isYou` argument
     goes unused here. It exists because French cannot: "Toi a posé" is wrong and
     has to become "Tu as posé". */
  /* eslint-disable @typescript-eslint/no-unused-vars */
  event: {
    cardPlayed: (name, _isYou, card) => `${name} played a ${cardName(card)}`,
    cardsDrawn: (name, _isYou, count) =>
      count === 1 ? `${name} drew a card` : `${name} drew ${cards(count)}`,
    unoCalled: (name, _isYou) => `${name} called UNO`,
    unoPenalty: (name, _isYou, count) => `${name} forgot to call UNO and drew ${cards(count)}`,
    calledOut: (by, byIsYou, target, targetIsYou) => {
      if (byIsYou) return `You caught ${target} without UNO`
      if (targetIsYou) return `${by} caught you without UNO`
      return `${by} caught ${target} without UNO`
    },
    handsSwapped: (by, byIsYou, target, targetIsYou) => {
      if (byIsYou) return `You played a 7 and took ${target}’s hand`
      if (targetIsYou) return `${by} played a 7 and took your hand`
      return `${by} played a 7 and took ${target}’s hand`
    },
    handsRotated: (clockwise) =>
      clockwise
        ? 'A 0 sent every hand one seat clockwise'
        : 'A 0 sent every hand one seat anticlockwise',
    jumpedIn: (name, isYou) =>
      isYou ? 'You jumped in, out of turn' : `${name} jumped in, out of turn`,
    seatDisconnected: (name) => `${name} lost connection`,
    // The only verb in the log that changes person: everything else is past tense.
    seatReconnected: (name, isYou) => (isYou ? 'You are back' : `${name} is back`),
    seatLeft: (name) => `${name} left the game`,
    turnTimedOut: (name, isYou) => (isYou ? 'You ran out of time' : `${name} ran out of time`),
    roundWon: (name, isYou, pts) =>
      `${isYou ? 'You win' : `${name} wins`} the round, +${points(pts)}`,
    roundAbandoned: () => 'Round abandoned — not enough players',
    matchResult: (names, youWon) => {
      if (names.length === 0) return 'The match ends with no winner'
      if (names.length === 1)
        return youWon ? 'You win the match' : `${names[0] ?? ''} wins the match`
      return youWon
        ? `You tie the match with ${list(names.filter((n) => n !== 'You'))}`
        : `${list(names)} tie the match`
    },
    roundStarted: (round) => `Round ${String(round)} dealt`,
    gameRestarted: () => 'A new match was dealt',
  },
  /* eslint-enable @typescript-eslint/no-unused-vars */

  home: {
    tagline: 'Two to four players. Share the code and deal.',
    yourName: 'Your name',
    namePlaceholder: 'Ana',
    createGame: 'Create a game',
    orJoin: 'or join one',
    gameCode: 'Game code',
    joinGame: 'Join game',
    matchEnds: 'How the match ends',
    firstToScore: 'First to a score',
    setRounds: 'A set number of rounds',
    winningScore: 'Winning score',
    rounds: 'Rounds',
    singleGame: 'Single game',
    blazing: 'Blazing',
    clockOnEveryTurn: 'Put a clock on every turn',
    secondsPerTurn: 'Seconds per turn',
    blazingHint:
      'Run out and you draw a card, even if you had one to play. Rounds deal themselves five seconds after the last one ends.',
    tableRules: 'House rules',
    liar: 'Let players call out a forgotten UNO',
    liarHint:
      'Forgetting to call UNO costs nothing unless somebody says so before the end of your next turn. Watch each other.',
    sevenZero: 'Play the Seven-Zero variant',
    sevenZeroHint:
      'A 7 swaps your hand with a player you choose; a 0 sends every hand one seat along, in the direction of play.',
    jumpIn: 'Allow jump-in',
    jumpInHint:
      'Holding the exact same card as the one just played — same colour, same value — you may lay it down out of turn, and play carries on from you. Never a wild, and never while a draw is pending.',
    language: 'Language',
  },

  help: {
    title: 'What the cards are worth',
    intro:
      'Win a round and you score everything left in the other players’ hands. Nobody scores for the cards they were still holding.',
    numberCardsLabel: 'Number cards',
    numberCards: (low, high) => `${String(low)}–${String(high)}, their face value`,
    skip: 'Skip',
    reverse: 'Reverse',
    drawTwo: 'Draw Two',
    wild: 'Wild',
    wildFour: 'Wild Draw Four',
    deckTotal: (total) =>
      `A full deck is ${String(total)} points. A round pays out only what the losers were still holding, so the same target takes far more rounds at two players than at four — worth knowing before picking one.`,
  },

  lobby: {
    gameCodeLabel: 'Game code',
    shareHint: 'Share this with the people you want to play.',
    copyCode: 'Copy code',
    copyLink: 'Copy link',
    codeCopied: 'Game code copied',
    linkCopied: 'Invite link copied',
    copyFailed: 'Couldn’t copy — select it by hand',
    waitingForPlayer: 'Waiting for a player…',
    host: 'Host',
    reconnecting: 'reconnecting…',
    left: 'left',
    startGame: 'Start game',
    needTwo: 'A game needs at least two players.',
    waitingForHost: (hostName) => `Waiting for ${hostName} to start the game.`,
    leaveTable: 'Leave table',
  },

  table: {
    yourTurn: 'your turn',
    theirTurn: 'their turn',
    drawCard: 'Draw card',
    take: (n) => `Take ${String(n)}`,
    callUno: 'UNO!',
    callOut: 'Liar!',
    callOutOn: (name) => `Call ${name} a liar`,
    jumpIn: 'Jump in!',
    chooseSwapTarget: 'Whose hand do you want?',
    swapTarget: (name, count) => `${name}, ${cards(count)}`,
    clockwise: 'Clockwise',
    anticlockwise: 'Anticlockwise',
    inPlay: (colour) => `${colour} in play`,
    left: (n) => `${String(n)} left`,
    sortDealt: 'As dealt',
    sortColour: 'By colour',
    sortValue: 'By value',
    secondsToPlay: 'seconds to play',
    secondsLeft: 'seconds left',
    muteSound: 'Mute sound',
    unmuteSound: 'Unmute sound',
    chooseColour: 'Choose a colour',
    cancel: 'Cancel',
    say: 'Say something…',
    send: 'Send',
    messageTable: 'Message the table',
    chatPanel: 'Table chat and log',
    collapsePanel: 'Collapse the table panel',
    you: 'You',
    seat: (n) => `Seat ${String(n)}`,
  },

  over: {
    roundAbandoned: 'Round abandoned',
    needsTwo: 'A game needs two players, so this one ends with no winner.',
    winsRound: (name, isYou) => `${isYou ? 'You win' : `${name} wins`} the round`,
    firstTo: (pts) => `First to ${points(pts)}`,
    roundOf: (round, total) => `Round ${String(round)} of ${String(total)}`,
    nextRound: 'Next round',
    newMatch: 'New match',
    waitingNextRound: 'Waiting for the host to deal the next round.',
    waitingNewMatch: 'Waiting for the host to start a new match.',
    dealsItself: 'The next round starts on its own.',
    dealsIn: (seconds) => `Next round deals in ${String(seconds)}…`,
    awards: {
      mostWild4: 'Most Wild Draw Fours',
      mostDrawn: 'Most cards drawn',
      forgotUno: 'Forgot UNO most',
      ranOutOfTime: 'Ran out of time most',
      mostPlayed: 'Most cards played',
    },
  },

  error: {
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
  },

  crash: {
    heading: 'Something in the table stopped working.',
    seatHeld:
      'Your seat is still held. Reloading rejoins the same game — the server keeps the state, so nothing is lost but this screen.',
    reload: 'Reload and rejoin',
  },

  goalSummary: (goal) =>
    goal.kind === 'points'
      ? `First to ${points(goal.target)}`
      : goal.count === 1
        ? 'A single game'
        : `Best of ${String(goal.count)} rounds`,
}
