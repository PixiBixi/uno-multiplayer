import type { Card, MatchGoal } from '@uno/engine'
import type { ErrorCode } from '@uno/protocol'
import type { CardTheme } from '../lib/card-themes.js'
import type { ActiveEffect } from '../lib/play-effects.js'

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

  /**
   * The same card, said of one a player cannot play this turn.
   *
   * A whole sentence rather than the name plus a translated suffix, for the reason
   * the rest of this file gives: English appends a dash and a clause, and French
   * turns the whole thing into an adjective agreeing with the card. It is also the
   * accessible label of every greyed card in a hand, which is why it is here and not
   * assembled at the call site.
   */
  cardUnplayable: (card: Card) => string

  /**
   * What a card with its back to you is. Game state, not decoration: it is on the
   * draw pile and in every opponent's fan, and it must not change with the card
   * theme — `CardBack.test.tsx` asserts that for all four faces.
   */
  cardFaceDown: string

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

  /**
   * The word each burst shouts across the table.
   *
   * `aria-hidden` decoration — every fact `PlayEffects` dramatises is also in the log
   * underneath — and translated regardless, because a French player watching a French
   * table should not be shouted at in English. Being invisible to a screen reader is
   * not the same as being invisible.
   *
   * `Record<ActiveEffect['kind'], string>` so a sixth flourish is a compile error in
   * both catalogues rather than a blank flash in one of them.
   */
  effect: Record<ActiveEffect['kind'], string>

  /** The banner shown while the socket is down and everything else is unreachable. */
  connection: { lost: string }

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
    /* One person again. It has to say the card was kept as well as that the turn ended:
       "Ana drew a card" no longer means her turn is over, so a line saying only that it
       ended would leave the log unable to explain what happened to the card. */
    turnPassed: (name: string, isYou: boolean) => string
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
    /** An example code, shown in the field. A placeholder is read out like any other
     *  label, so it belongs here beside `namePlaceholder` rather than in the JSX. */
    codePlaceholder: string
    joinGame: string
    language: string
  }

  /**
   * The table configuration, which the lobby owns and the home screen no longer offers.
   *
   * Its own section rather than left under `home`, because both the host's controls and
   * the guest's read-only list are rendered from these keys — a lobby component reading
   * `t.home.*` would be a name that lies about where the words are used.
   */
  config: {
    matchEnds: string
    /** Accessible name for the pair of buttons inside the "how the match ends" set —
     *  the legend names the question, this names the control. */
    matchFormat: string
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
    /** The one option here that is on by default, and the only one that is a real rule. */
    playDrawnCard: string
    playDrawnCardHint: string
    /**
     * The disclosure holding one rule's explanation.
     *
     * Four paragraphs on permanent display is what made the home screen a wall of text.
     * In the lobby the reader has already chosen to look, so the label is short and the
     * accessible name says which rule it belongs to — four identical summaries would
     * otherwise be four identical announcements.
     */
    whatThisDoes: string
    explainRule: (rule: string) => string
    /** What a rule's state reads as when nobody at this seat may change it. */
    ruleOn: string
    ruleOff: string
    /** How the pace reads when the table has no clock at all. */
    noClock: string
    /** The pace, said in one line rather than as a control. */
    paceSummary: (seconds: number) => string
    /** Said to a guest: the settings above are somebody else's to change. */
    setByHost: (hostName: string) => string
    /** Said to the host once the deal has frozen the configuration. */
    lockedByDeal: string
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
    /** Stands in for the host's name when the roster has not arrived yet, so it has to
     *  read as a noun inside `waitingForHost` — "the host", not "Host". */
    theHost: string
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
    /**
     * Every rule and its state, always, so the game says what it plays by instead of
     * leaving everyone to remember the lobby.
     *
     * All four rather than only the unusual ones, which was the first attempt: an ordinary
     * table then rendered nothing, and nothing is indistinguishable from a feature that is
     * not there. The person who asked for it could not tell. Short names, because these
     * sit in a strip above the play.
     */
    rulesHeading: string
    ruleShort: {
      liar: string
      sevenZero: string
      jumpIn: string
      playDrawnCard: string
    }
    /** The state, for a screen reader — the tick beside it is decoration. */
    ruleOn: string
    ruleOff: string
    /** Marks the seat a call-out is available against, so the eye goes to the person. */
    openToCallOut: string
    /**
     * Told to the player who is exposed. Not a courtesy: escaping by calling UNO on your own
     * next turn is the rule, so a player who is not told is playing a different game from
     * the one everybody else can see.
     */
    youAreExposed: string
    /** Shown when the server has offered a play off turn, which is a jump-in. */
    jumpIn: string
    /**
     * The control that ends a turn after drawing, and the line telling you it is there.
     *
     * Named for what it does rather than "pass", which in a card game reads as declining to
     * draw — the opposite of what has just happened. And the note is not decoration: a
     * player who draws a card that looks unplayable to them, sees the draw button go dead
     * and nothing else change, will conclude the game has hung.
     */
    endTurn: string
    playDrawnCard: string
    /** Title of the Seven-Zero target picker, the 7's answer to choosing a colour. */
    chooseSwapTarget: string
    /** One target button: whose hand it is, and how many cards you would take. */
    swapTarget: (name: string, cards: number) => string
    clockwise: string
    anticlockwise: string
    inPlay: (colour: string) => string
    left: (n: number) => string
    /**
     * The draw debt a chain of +2s has piled up.
     *
     * One sentence including the number, not a badge with the count in its own span:
     * French puts the figure where French wants it, and a component that renders
     * "+6" and then the word beside it has already decided the word order for every
     * language. The digits keep their tabular font from `.debt-badge` instead.
     */
    stacked: (n: number) => string
    /** Accessible name for the group of three sort buttons. */
    /**
     * The note under a seat whose player has gone.
     *
     * Says more than the lobby's `left` on purpose. In the roster it is one column of
     * a vertical list and reads as a status; on the felt it sits a few centimetres
     * from a badge that says "Anticlockwise", where a bare English "left" is a
     * direction. The extra two words cost nothing and remove the ambiguity.
     */
    hasLeft: string
    sortHand: string
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
    /** The panel's own heading, and the label on the tab that reopens it. */
    panelTitle: string
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

  /**
   * The events worth interrupting a player for, as the two lines a toast shows.
   *
   * A toast is a sentence a player reads, so it belongs here rather than in the
   * reducer that decides *whether* to raise one. The reducer takes a `Messages`
   * argument the way `describeEvent` does — it is pure, knows no React, and cannot
   * reach a context; a module that imported one catalogue directly could never be
   * switched at runtime.
   */
  toast: {
    /** The count is a whole clause, because French keeps the singular at one and zero. */
    unoMissed: { title: string; detail: (count: number) => string }
    lostConnection: { title: string; detail: string }
    playerLeft: { title: string; detail: string }
    roundAbandoned: { title: string; detail: string }
    roundOver: { title: string; detail: string }
    matchOver: { title: string; detail: string }
    nextRound: { title: string; detail: string }
    newMatch: { title: string; detail: string }
  }

  /**
   * Accessible name for a toast's close button, which has to say which toast it
   * closes because several can stand at once.
   *
   * Outside the `toast` group on purpose: every entry in there is one interruption,
   * as a title and a detail, and `game-reducer.test.ts` walks the group asserting
   * exactly that shape. A control label sitting among them would be a fourth kind of
   * thing in a list of three.
   */
  dismissToast: (title: string) => string

  error: Record<ErrorCode, string>

  crash: {
    heading: string
    seatHeld: string
    reload: string
  }

  goalSummary: (goal: MatchGoal) => string
}
