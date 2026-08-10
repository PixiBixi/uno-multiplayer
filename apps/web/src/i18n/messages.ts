import type { Card, MatchGoal } from '@uno/engine'
import type { ErrorCode } from '@uno/protocol'
import type { CardTheme } from '../lib/card-themes.js'

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

  /**
   * The card face a player chose for themselves. Named in both places it can be
   * changed — the previews on the home screen and the cycler on the table — and
   * `Record<CardTheme, string>` so adding a theme is a compile error in every
   * catalogue rather than a blank in one of them.
   */
  cardTheme: {
    label: string
    /** Accessible name for a control showing one theme: "Card theme: Classic". */
    named: (name: string) => string
    name: Record<CardTheme, string>
  }

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
    /* Two people in one sentence, so both persons are passed: French conjugates
       the accuser and the accused differently, and English does not. */
    calledOut: (by: string, byIsYou: boolean, target: string, targetIsYou: boolean) => string
    /* Two people again, and the same reason: French conjugates the seat that played
       the 7 and the seat it took a hand from differently. */
    handsSwapped: (by: string, byIsYou: boolean, target: string, targetIsYou: boolean) => string
    /** `clockwise` rather than the raw 1 / -1: the sentence names a direction. */
    handsRotated: (clockwise: boolean) => string
    /* One person, and the same reason as the rest: French conjugates the jumper.
       The card itself is named by the `cardPlayed` line that follows. */
    jumpedIn: (name: string, isYou: boolean) => string
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
    tableRules: string
    liar: string
    liarHint: string
    sevenZero: string
    sevenZeroHint: string
    jumpIn: string
    jumpInHint: string
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
    /** The button itself, short enough to sit beside a seat. */
    callOut: string
    /** Its accessible name, which has to say who is being accused. */
    callOutOn: (name: string) => string
    /** Shown when the server has offered a play off turn, which is a jump-in. */
    jumpIn: string
    /** Title of the Seven-Zero target picker, the 7's answer to choosing a colour. */
    chooseSwapTarget: string
    /** One target button: whose hand it is, and how many cards you would take. */
    swapTarget: (name: string, cards: number) => string
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
