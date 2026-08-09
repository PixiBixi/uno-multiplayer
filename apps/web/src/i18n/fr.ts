import type { Card } from '@uno/engine'
import type { Messages } from './messages.js'

const COULEUR: Record<'R' | 'G' | 'B' | 'Y', string> = {
  R: 'Rouge',
  G: 'Vert',
  B: 'Bleu',
  Y: 'Jaune',
}

/*
 * Card names carry gender in French, which English does not have to think about.
 * "Rouge 7" is fine, but the action cards need an article that agrees: un Passe
 * (masculine), une Inversion (feminine), un +2. Building these from fragments in
 * a shared helper would force French to inherit English word order; each language
 * spelling out its own sentences is what avoids that.
 */
const nomCarte = (card: Card): string => {
  switch (card.kind) {
    case 'number':
      return `${COULEUR[card.color]} ${String(card.value)}`
    case 'skip':
      return `Passe ${COULEUR[card.color].toLowerCase()}`
    case 'reverse':
      return `Inversion ${COULEUR[card.color].toLowerCase()}`
    case 'draw2':
      return `+2 ${COULEUR[card.color].toLowerCase()}`
    case 'wild':
      return 'Joker'
    case 'wild4':
      return '+4'
  }
}

/** French pluralises from 2, and 0 stays singular — unlike English. */
const cartes = (n: number) => (Math.abs(n) < 2 ? `${String(n)} carte` : `${String(n)} cartes`)
const points = (n: number) => (Math.abs(n) < 2 ? `${String(n)} point` : `${String(n)} points`)

const liste = (noms: string[]): string => {
  if (noms.length <= 1) return noms[0] ?? ''
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1] ?? ''}`
}

/** "Tu" throughout: this is a game between friends, not a bank. */
export const fr: Messages = {
  card: nomCarte,
  colour: (colour) => COULEUR[colour],
  count: { cards: cartes, points, list: liste },

  event: {
    cardPlayed: (name, card) => `${name} a posé ${nomCarte(card)}`,
    cardsDrawn: (name, count) =>
      count === 1 ? `${name} a pioché une carte` : `${name} a pioché ${cartes(count)}`,
    unoCalled: (name) => `${name} a crié UNO`,
    unoPenalty: (name, count) => `${name} a oublié de crier UNO et pioche ${cartes(count)}`,
    seatDisconnected: (name) => `${name} a perdu la connexion`,
    seatReconnected: (name, isYou) => (isYou ? 'Te revoilà' : `${name} est de retour`),
    seatLeft: (name) => `${name} a quitté la partie`,
    turnTimedOut: (name, isYou) => (isYou ? 'Tu n’as plus de temps' : `${name} n’a plus de temps`),
    roundWon: (name, isYou, pts) =>
      `${isYou ? 'Tu gagnes' : `${name} gagne`} la manche, +${points(pts)}`,
    roundAbandoned: () => 'Manche abandonnée — pas assez de joueurs',
    matchResult: (names, youWon) => {
      if (names.length === 0) return 'La partie se termine sans vainqueur'
      if (names.length === 1) {
        return youWon ? 'Tu gagnes la partie' : `${names[0] ?? ''} gagne la partie`
      }
      return youWon
        ? `Tu es à égalité avec ${liste(names.filter((n) => n !== 'Toi'))}`
        : `${liste(names)} sont à égalité`
    },
    roundStarted: (round) => `Manche ${String(round)} distribuée`,
    gameRestarted: () => 'Une nouvelle partie a été distribuée',
  },

  home: {
    tagline: 'De deux à quatre joueurs. Partage le code et distribue.',
    yourName: 'Ton prénom',
    namePlaceholder: 'Ana',
    createGame: 'Créer une partie',
    orJoin: 'ou rejoins-en une',
    gameCode: 'Code de la partie',
    joinGame: 'Rejoindre',
    matchEnds: 'Comment la partie se termine',
    firstToScore: 'Premier à un score',
    setRounds: 'Un nombre de manches',
    winningScore: 'Score gagnant',
    rounds: 'Manches',
    singleGame: 'Une seule manche',
    blazing: 'Blazing',
    clockOnEveryTurn: 'Mettre un chrono sur chaque tour',
    secondsPerTurn: 'Secondes par tour',
    blazingHint:
      'Le temps écoulé, tu pioches — même si tu avais une carte à jouer. Les manches s’enchaînent cinq secondes après la précédente.',
    language: 'Langue',
  },

  help: {
    title: 'Ce que valent les cartes',
    intro:
      'Gagne une manche et tu marques tout ce qui reste dans les mains des autres. Personne ne marque pour les cartes qu’il tenait encore.',
    numberCards: (low, high) => `${String(low)} à ${String(high)}, leur valeur faciale`,
    skip: 'Passe',
    reverse: 'Inversion',
    drawTwo: '+2',
    wild: 'Joker',
    wildFour: '+4',
    deckTotal: (total) =>
      `Un jeu complet vaut ${String(total)} points. Une manche ne rapporte que ce que les perdants tenaient encore, donc le même objectif demande bien plus de manches à deux joueurs qu’à quatre — bon à savoir avant de choisir.`,
  },

  lobby: {
    gameCodeLabel: 'Code de la partie',
    shareHint: 'Partage-le avec les personnes que tu veux inviter.',
    copyCode: 'Copier le code',
    copyLink: 'Copier le lien',
    codeCopied: 'Code copié',
    linkCopied: 'Lien d’invitation copié',
    copyFailed: 'Copie impossible — sélectionne-le à la main',
    waitingForPlayer: 'En attente d’un joueur…',
    host: 'Hôte',
    reconnecting: 'reconnexion…',
    left: 'parti',
    startGame: 'Lancer la partie',
    needTwo: 'Il faut au moins deux joueurs.',
    waitingForHost: (hostName) => `En attente que ${hostName} lance la partie.`,
    leaveTable: 'Quitter la table',
  },

  table: {
    yourTurn: 'à toi',
    theirTurn: 'à eux',
    drawCard: 'Piocher',
    take: (n) => `Prendre ${String(n)}`,
    callUno: 'UNO !',
    clockwise: 'Sens horaire',
    anticlockwise: 'Sens antihoraire',
    inPlay: (colour) => `${colour} en jeu`,
    left: (n) => `${String(n)} restantes`,
    sortDealt: 'Distribuées',
    sortColour: 'Par couleur',
    sortValue: 'Par valeur',
    secondsToPlay: 'secondes pour jouer',
    secondsLeft: 'secondes restantes',
    muteSound: 'Couper le son',
    unmuteSound: 'Activer le son',
    chooseColour: 'Choisis une couleur',
    cancel: 'Annuler',
    say: 'Dis quelque chose…',
    send: 'Envoyer',
    messageTable: 'Écrire à la table',
    you: 'Toi',
    seat: (n) => `Siège ${String(n)}`,
  },

  over: {
    roundAbandoned: 'Manche abandonnée',
    needsTwo: 'Il faut deux joueurs, donc celle-ci se termine sans vainqueur.',
    winsRound: (name, isYou) => `${isYou ? 'Tu gagnes' : `${name} gagne`} la manche`,
    firstTo: (pts) => `Premier à ${points(pts)}`,
    roundOf: (round, total) => `Manche ${String(round)} sur ${String(total)}`,
    nextRound: 'Manche suivante',
    newMatch: 'Nouvelle partie',
    waitingNextRound: 'En attente que l’hôte distribue la manche suivante.',
    waitingNewMatch: 'En attente que l’hôte lance une nouvelle partie.',
    dealsItself: 'La manche suivante démarre toute seule.',
    dealsIn: (seconds) => `Manche suivante dans ${String(seconds)}…`,
    awards: {
      mostWild4: 'Le plus de +4',
      mostDrawn: 'Le plus de cartes piochées',
      forgotUno: 'A le plus oublié UNO',
      ranOutOfTime: 'Le plus souvent hors délai',
      mostPlayed: 'Le plus de cartes posées',
    },
  },

  error: {
    room_not_found: 'Aucune partie avec ce code.',
    room_full: 'Cette partie a déjà quatre joueurs.',
    invalid_payload: 'Ça n’avait pas l’air correct. Réessaie.',
    not_host: 'Seul l’hôte peut faire ça.',
    too_few_players: 'Il faut au moins deux joueurs.',
    game_already_started: 'Cette partie est déjà en cours.',
    game_not_started: 'La partie n’a pas encore commencé.',
    illegal_move: 'Cette carte ne peut pas être jouée maintenant.',
    not_your_turn: 'Ce n’est pas ton tour.',
    rate_limited: 'Doucement une seconde.',
    invalid_session: 'Ton siège a été donné. Rejoins pour jouer.',
    server_full: 'Le serveur est plein. Réessaie dans un instant.',
    round_in_progress: 'Cette manche est encore en cours.',
    match_over: 'La partie est terminée. Lances-en une nouvelle pour continuer.',
  },

  crash: {
    heading: 'Quelque chose dans la table s’est arrêté.',
    seatHeld:
      'Ton siège est conservé. Recharger te fait rejoindre la même partie — le serveur garde l’état, il n’y a que cet écran de perdu.',
    reload: 'Recharger et rejoindre',
  },

  goalSummary: (goal) =>
    goal.kind === 'points'
      ? `Premier à ${points(goal.target)}`
      : goal.count === 1
        ? 'Une seule manche'
        : `Au meilleur des ${String(goal.count)} manches`,
}
