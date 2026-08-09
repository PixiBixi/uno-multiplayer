import type { Card, MatchGoal } from '@uno/engine'
import type { ErrorCode } from '@uno/protocol'

export const LOCALES = ['en', 'fr'] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_NAME: Record<Locale, string> = { en: 'English', fr: 'Français' }

/**
 * The shape every language fills in.
 *
 * Every entry that varies is a FUNCTION, not a template with holes punched in it.
 * That is the whole design. English builds "Ana wins" from a name and an "s";
 * French builds "Ana gagne" from a different stem entirely, and "You win" becomes
 * "Tu gagnes" where the verb changes rather than the pronoun. A catalogue of
 * fragments joined by the caller can only ever express the grammar of whichever
 * language was written first — usually English, invisibly.
 *
 * So the unit of translation here is a whole sentence, and each language owns how
 * it is built. That costs a little repetition and buys the ability to translate
 * into a language that does not agree with English about word order, plurals,
 * gender or conjugation.
 */
export type Messages = {
  /** Card names, which appear inside sentences and so must be a language's own. */
  card: (card: Card) => string
  colour: (colour: 'R' | 'G' | 'B' | 'Y') => string

  count: {
    cards: (n: number) => string
    points: (n: number) => string
    /** "Ana", "Ana and Ben", "Ana, Ben and Cleo". */
    list: (names: string[]) => string
  }

  /** One entry per GameEvent the log can describe. */
  event: {
    /* `isYou` on every one of these, because French needs it where English does
       not: "You played" survives with one form, "Toi a posé" does not — it has to
       become "Tu as posé". Passing the person to all of them lets each language
       decide whether it cares. */
    cardPlayed: (name: string, isYou: boolean, card: Card) => string
    cardsDrawn: (name: string, isYou: boolean, count: number) => string
    unoCalled: (name: string, isYou: boolean) => string
    unoPenalty: (name: string, isYou: boolean, count: number) => string
    seatDisconnected: (name: string) => string
    seatReconnected: (name: string, isYou: boolean) => string
    seatLeft: (name: string) => string
    turnTimedOut: (name: string, isYou: boolean) => string
    roundWon: (name: string, isYou: boolean, points: number) => string
    roundAbandoned: () => string
    matchResult: (names: string[], youWon: boolean) => string
    roundStarted: (round: number) => string
    gameRestarted: () => string
  }

  home: {
    tagline: string
    yourName: string
    namePlaceholder: string
    createGame: string
    orJoin: string
    gameCode: string
    joinGame: string
    matchEnds: string
    firstToScore: string
    setRounds: string
    winningScore: string
    rounds: string
    singleGame: string
    blazing: string
    clockOnEveryTurn: string
    secondsPerTurn: string
    blazingHint: string
    language: string
  }

  help: {
    title: string
    intro: string
    numberCardsLabel: string
    numberCards: (low: number, high: number) => string
    skip: string
    reverse: string
    drawTwo: string
    wild: string
    wildFour: string
    deckTotal: (total: number) => string
  }

  lobby: {
    gameCodeLabel: string
    shareHint: string
    copyCode: string
    copyLink: string
    codeCopied: string
    linkCopied: string
    copyFailed: string
    waitingForPlayer: string
    host: string
    reconnecting: string
    left: string
    startGame: string
    needTwo: string
    waitingForHost: (hostName: string) => string
    leaveTable: string
  }

  table: {
    yourTurn: string
    theirTurn: string
    drawCard: string
    take: (n: number) => string
    callUno: string
    clockwise: string
    anticlockwise: string
    inPlay: (colour: string) => string
    left: (n: number) => string
    sortDealt: string
    sortColour: string
    sortValue: string
    secondsToPlay: string
    secondsLeft: string
    muteSound: string
    unmuteSound: string
    chooseColour: string
    cancel: string
    say: string
    send: string
    messageTable: string
    chatPanel: string
    collapsePanel: string
    you: string
    seat: (n: number) => string
  }

  over: {
    roundAbandoned: string
    needsTwo: string
    winsRound: (name: string, isYou: boolean) => string
    firstTo: (points: number) => string
    roundOf: (round: number, total: number) => string
    nextRound: string
    newMatch: string
    waitingNextRound: string
    waitingNewMatch: string
    dealsItself: string
    dealsIn: (seconds: number) => string
    awards: {
      mostWild4: string
      mostDrawn: string
      forgotUno: string
      ranOutOfTime: string
      mostPlayed: string
    }
  }

  error: Record<ErrorCode, string>

  crash: {
    heading: string
    seatHeld: string
    reload: string
  }

  goalSummary: (goal: MatchGoal) => string
}
