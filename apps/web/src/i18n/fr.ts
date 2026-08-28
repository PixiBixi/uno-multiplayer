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

/** French pluralises from 2, and 0 stays singular - unlike English. */
const cartes = (n: number) => (Math.abs(n) < 2 ? `${String(n)} carte` : `${String(n)} cartes`)
const points = (n: number) => (Math.abs(n) < 2 ? `${String(n)} point` : `${String(n)} points`)

const liste = (noms: string[]): string => {
  if (noms.length <= 1) return noms[0] ?? ''
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1] ?? ''}`
}

/** "Tu" throughout: this is a game between friends, not a bank. */
export const fr: Messages = {
  card: nomCarte,
  /* « injouable » plutôt qu’un calque de « not playable this turn » : un adjectif là
     où l’anglais met une proposition. Pas de tiret cadratin non plus - la phrase se
     construit autrement, ce qui est précisément pourquoi c’est une entrée entière et
     pas un suffixe collé au nom de la carte. */
  cardUnplayable: (card) => `${nomCarte(card)}, injouable ce tour-ci`,
  cardFaceDown: 'Carte face cachée',
  colour: (colour) => COULEUR[colour],
  /* Les noms de thèmes sont traduits plutôt que laissés en anglais : ce sont des
     mots courants en français, contrairement à « jump-in ». « Typographié » dit ce
     que fait la carte - une couleur en filet, un chiffre en serif - là où un calque
     de « letterpress » ne dirait rien à personne. */
  cardTheme: {
    note: {
      poster: 'par défaut',
      classic: 'le carton imprimé',
      flat: 'le plus lisible',
      letterpress: 'papier',
      minuit: 'trouvé, pas choisi',
      neon: 'halo',
    },
    chosen: 'choisi',
    privacy:
      'Préférence personnelle : elle ne traverse jamais le réseau. Deux joueurs à la même table peuvent en avoir deux différentes.',
    label: 'Thème des cartes',
    named: (name) => `Thème des cartes : ${name}`,
    name: {
      poster: 'Affiche',
      classic: 'Classique',
      flat: 'Épuré',
      letterpress: 'Typographié',
      minuit: 'Minuit',
      neon: 'Néon',
    },
  },
  count: { cards: cartes, points, list: liste },

  /* Les mêmes mots que sur les cartes : PASSE, INVERSION, JOKER. Laisser « SKIP » en
     travers d’une table française serait le seul mot anglais de l’écran, et il est
     écrit en capitales de 4 rem. */
  effect: {
    wild4: '+4',
    wild: 'JOKER',
    draw2: '+2',
    skip: 'PASSE',
    reverse: 'INVERSION',
    uno: 'UNO !',
  },

  connection: { lost: 'Connexion perdue. Tentative de reconnexion…' },

  event: {
    cardPlayed: (name, isYou, card) =>
      isYou ? `Tu as posé ${nomCarte(card)}` : `${name} a posé ${nomCarte(card)}`,
    cardsDrawn: (name, isYou, count) => {
      const quoi = count === 1 ? 'une carte' : cartes(count)
      return isYou ? `Tu as pioché ${quoi}` : `${name} a pioché ${quoi}`
    },
    unoCalled: (name, isYou) => (isYou ? 'Tu as crié UNO' : `${name} a crié UNO`),
    unoPenalty: (name, isYou, count) =>
      isYou
        ? `Tu as oublié de crier UNO et tu pioches ${cartes(count)}`
        : `${name} a oublié de crier UNO et pioche ${cartes(count)}`,
    calledOut: (by, byIsYou, target, targetIsYou) => {
      if (byIsYou) return `Tu as pris ${target} en flagrant délit : UNO oublié`
      if (targetIsYou) return `${by} t’a pris en flagrant délit : UNO oublié`
      return `${by} a pris ${target} en flagrant délit : UNO oublié`
    },
    handsSwapped: (by, byIsYou, target, targetIsYou) => {
      if (byIsYou) return `Tu as posé un 7 et pris la main de ${target}`
      if (targetIsYou) return `${by} a posé un 7 et pris ta main`
      return `${by} a posé un 7 et pris la main de ${target}`
    },
    handsRotated: (clockwise) =>
      clockwise
        ? 'Un 0 a fait tourner toutes les mains d’un siège dans le sens horaire'
        : 'Un 0 a fait tourner toutes les mains d’un siège dans le sens antihoraire',
    jumpedIn: (name, isYou) =>
      isYou ? 'Tu as sauté sur la carte, hors tour' : `${name} a sauté sur la carte, hors tour`,
    turnPassed: (name, isYou) =>
      isYou
        ? 'Tu as gardé la carte piochée et terminé ton tour'
        : `${name} a gardé la carte piochée et terminé son tour`,
    seatDisconnected: (name) => `${name} a perdu la connexion`,
    seatReconnected: (name, isYou) => (isYou ? 'Te revoilà' : `${name} est de retour`),
    seatLeft: (name) => `${name} a quitté la partie`,
    turnTimedOut: (name, isYou) => (isYou ? 'Tu n’as plus de temps' : `${name} n’a plus de temps`),
    roundWon: (name, isYou, pts) =>
      `${isYou ? 'Tu gagnes' : `${name} gagne`} la manche, +${points(pts)}`,
    roundAbandoned: () => 'Manche abandonnée - pas assez de joueurs',
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
    codePlaceholder: 'K7QM2X',
    joinGame: 'Rejoindre',
    colourMode: 'Palette',
    colourModeName: { system: 'Système', light: 'Papier', dark: 'Encre' },
    language: 'Langue',
  },

  config: {
    tableSettings: 'Réglages de la table',
    matchEnds: 'Comment la partie se termine',
    matchFormat: 'Format de la partie',
    firstToScore: 'Premier à un score',
    setRounds: 'Un nombre de manches',
    winningScore: 'Score gagnant',
    rounds: 'Manches',
    singleGame: 'Une seule manche',
    blazing: 'Blazing',
    clockOnEveryTurn: 'Mettre un chrono sur chaque tour',
    secondsPerTurn: 'Secondes par tour',
    blazingHint:
      'Le temps écoulé, tu pioches - même si tu avais une carte à jouer. Les manches s’enchaînent cinq secondes après la précédente.',
    tableRules: 'Règles de table',
    liar: 'Laisser les joueurs dénoncer un UNO oublié',
    liarHint:
      'Oublier de crier UNO ne coûte rien, sauf si quelqu’un le remarque avant la fin de ton tour suivant. Surveillez-vous.',
    sevenZero: 'Jouer la variante Sept-Zéro',
    sevenZeroHint:
      'Un 7 échange ta main avec celle d’un joueur de ton choix ; un 0 fait tourner toutes les mains d’un siège, dans le sens du jeu.',
    jumpIn: 'Autoriser le Jump-in',
    jumpInHint:
      'Si tu as exactement la même carte que celle qui vient d’être posée - même couleur, même valeur - tu peux la poser hors de ton tour, et le jeu reprend depuis toi. Jamais un joker, et jamais pendant une pioche en attente.',
    playDrawnCard: 'Laisser poser la carte que l’on vient de piocher',
    playDrawnCardHint:
      'La règle officielle, donc active sauf si tu la désactives : si la carte piochée est jouable, tu peux la poser aussitôt, ou la garder et terminer ton tour. Rien ne change quand elle est injouable - le tour se termine, comme avant.',
    ruleOn: 'activée',
    ruleOff: 'désactivée',
    noClock: 'Pas de chrono',
    paceSummary: (seconds) => `${String(seconds)} secondes par tour`,
    setByHost: (hostName) => `C’est ${hostName} qui règle tout ça pour la table.`,
    lockedByDeal: 'Les cartes sont distribuées : la table est réglée pour toute la partie.',
  },

  help: {
    title: 'Ce que valent les cartes',
    intro:
      'Gagne une manche et tu marques tout ce qui reste dans les mains des autres. Personne ne marque pour les cartes qu’il tenait encore.',
    numberCardsLabel: 'Cartes chiffrées',
    numberCards: (low, high) => `${String(low)} à ${String(high)}, leur valeur faciale`,
    skip: 'Passe',
    reverse: 'Inversion',
    drawTwo: '+2',
    wild: 'Joker',
    wildFour: '+4',
    deckTotal: (total) =>
      `Un jeu complet vaut ${String(total)} points. Une manche ne rapporte que ce que les perdants tenaient encore, donc le même objectif demande bien plus de manches à deux joueurs qu’à quatre - bon à savoir avant de choisir.`,
  },

  lobby: {
    seatNumber: (n) => `Siège ${String(n)}`,
    freeSeat: 'en attente',
    gameCodeLabel: 'Code de la partie',
    shareHint: 'Partage-le avec les personnes que tu veux inviter.',
    copyCode: 'Copier le code',
    copyLink: 'Copier le lien',
    codeCopied: 'Code copié',
    linkCopied: 'Lien d’invitation copié',
    copyFailed: 'Copie impossible - sélectionne-le à la main',
    waitingForPlayer: 'En attente d’un joueur…',
    host: 'Hôte',
    theHost: 'l’hôte',
    reconnecting: 'reconnexion…',
    left: 'parti',
    startGame: 'Lancer la partie',
    needTwo: 'Il faut au moins deux joueurs.',
    waitingForHost: (hostName) => `En attente que ${hostName} lance la partie.`,
    leaveTable: 'Quitter la table',
  },

  table: {
    opponents: 'Adversaires',
    discardPile: 'Talon',
    yourMove: 'À toi de jouer',
    waitingOn: (name) => `Au tour de ${name}`,
    yourTurn: 'à toi',
    theirTurn: 'à eux',
    upNext: 'Ensuite',
    drawCard: 'Piocher',
    take: (n) => `Prendre ${String(n)}`,
    callUno: 'UNO !',
    /* « Contre-UNO » et non « Menteur » : oublier n'est pas mentir, et le terme courant
       dit ce que le bouton fait plutôt que d'accuser quelqu'un de mauvaise foi. */
    callOut: 'Contre-UNO !',
    callOutOn: (name) => `Contre-UNO sur ${name}`,
    rulesHeading: 'Règles',
    ruleShort: {
      liar: 'Contre-UNO',
      sevenZero: 'Sept-Zéro',
      jumpIn: 'Jump-in',
      playDrawnCard: 'Poser la carte piochée',
    },
    ruleOn: 'activée',
    ruleOff: 'désactivée',
    openToCallOut: 'Contre-UNO possible',
    youAreExposed:
      'Tu es à une carte sans avoir dit UNO - annonce-le tout de suite, avant qu’on te contre.',
    jumpIn: 'Jump-in !',
    endTurn: 'Terminer mon tour',
    playDrawnCard: 'Pose la carte piochée, ou termine ton tour',
    chooseSwapTarget: 'Quelle main veux-tu ?',
    swapTarget: (name, count) => `${name}, ${cartes(count)}`,
    clockwise: 'Sens horaire',
    anticlockwise: 'Sens antihoraire',
    inPlay: (colour) => `${colour} en jeu`,
    left: (n) => `${String(n)} restantes`,
    /* « en attente » et non « empilées » : ce qui compte est que la dette n’est pas
       encore payée, pas la façon dont elle s’est constituée. Locution invariable, donc
       aucun accord à faire ici - contrairement à `left`, juste au-dessus. */
    stacked: (n) => `+${String(n)} en attente`,
    hasLeft: 'a quitté la partie',
    sortHand: 'Trier ta main',
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
    chatPanel: 'Discussion et journal de la table',
    panelTitle: 'Table',
    collapsePanel: 'Replier le panneau',
    you: 'Toi',
    seat: (n) => `Siège ${String(n)}`,
  },

  voice: {
    label: 'Salon vocal',
    join: 'Rejoindre le vocal',
    joining: 'Connexion…',
    leave: 'Quitter le vocal',
    mute: 'Couper mon micro',
    unmute: 'Rouvrir mon micro',
    alone: 'En attente d’un autre joueur sur le vocal.',
    noMicrophone: 'Pas de micro. Tu entendras quand même les autres.',
    peerMuted: (name) => `${name} a coupé son micro`,
    muted: 'micro coupé',
    unavailableWith: (name) => `Vocal indisponible avec ${name}`,
    muteThem: (name) => `Couper ${name}`,
    unmuteThem: (name) => `Réactiver ${name}`,
    shoutListening: 'Crie « uno » pour annoncer.',
    shoutUnsupported: 'Ce navigateur ne reconnaît pas le mot. Utilise le bouton UNO.',
    shoutOffline: 'Crier « uno » demande un pack de langue hors ligne.',
    shoutInstall: 'Le télécharger',
    shoutInstalling: 'Téléchargement…',
    shoutInstallFailed:
      'Le téléchargement n’a pas démarré. Tu peux toujours utiliser le bouton UNO.',
    shoutCloud:
      'Annoncer UNO en le criant. Ce navigateur n’a pas de reconnaissance hors ligne, ton micro part donc chez son éditeur quand ta main touche à sa fin.',
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
    awardsTitle: 'Palmarès de la table',
    awards: {
      mostWild4: 'Le plus de +4',
      mostDrawn: 'Le plus de cartes piochées',
      forgotUno: 'A le plus oublié UNO',
      ranOutOfTime: 'Le plus souvent hors délai',
      mostPlayed: 'Le plus de cartes posées',
    },
  },

  /* Les titres restent courts - un bandeau qui passe - et le détail dit la
     conséquence. « Manche » et « partie » sont distingués partout : une partie est
     une suite de manches, et confondre les deux rend le score incompréhensible. */
  toast: {
    unoMissed: { title: 'UNO n’a pas été crié', detail: (count) => `${cartes(count)} en plus.` },
    lostConnection: {
      title: 'Un joueur a perdu la connexion',
      detail: 'Ses tours sont passés jusqu’à son retour.',
    },
    playerLeft: { title: 'Un joueur est parti', detail: 'Ses cartes sont retournées à la pioche.' },
    roundAbandoned: { title: 'Manche abandonnée', detail: 'Il ne reste pas assez de joueurs.' },
    roundOver: { title: 'Manche terminée', detail: 'Les points vont à qui s’est débarrassé.' },
    matchOver: { title: 'Partie terminée', detail: 'Le classement est définitif.' },
    nextRound: { title: 'Manche suivante', detail: 'L’hôte a redistribué.' },
    newMatch: { title: 'Nouvelle partie', detail: 'Les scores sont remis à zéro.' },
  },

  dismissToast: (title) => `Fermer : ${title}`,

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
    voice_not_joined: 'Rejoins d’abord le salon vocal.',
    voice_peer_unavailable: 'Ce joueur n’est pas sur le salon vocal.',
  },

  crash: {
    heading: 'Quelque chose dans la table s’est arrêté.',
    seatHeld:
      'Ton siège est conservé. Recharger te fait rejoindre la même partie - le serveur garde l’état, il n’y a que cet écran de perdu.',
    reload: 'Recharger et rejoindre',
  },

  goalSummary: (goal) =>
    goal.kind === 'points'
      ? `Premier à ${points(goal.target)}`
      : goal.count === 1
        ? 'Une seule manche'
        : `Au meilleur des ${String(goal.count)} manches`,
}
