# UNO multijoueur — Design

- **Date** : 2026-08-04
- **Statut** : sections 1 et « approche » validées par l'utilisateur ; sections 2 et 3 rédigées, en attente de relecture
- **Origine** : réécriture complète, à partir de zéro, du fork `mizanxali/uno-online` (prototype 2 joueurs, client-authoritative, stack 2021). Aucun code repris.

---

## 1. Objectif et contexte

Jeu de UNO en ligne, **2 à 4 joueurs**, jouable depuis un navigateur, déployé sur un serveur personnel via une image Docker. L'URL sera publique mais peu diffusée : le trafic attendu est de quelques parties simultanées au maximum, mais le service doit résister aux tricheurs et aux abus, puisqu'il est accessible sans authentification.

### Critères de succès

1. Une partie de 2 à 4 joueurs se déroule de bout en bout sans crash ni blocage.
2. Un joueur ne peut ni voir les cartes des autres, ni jouer un coup illégal, ni jouer à la place d'un autre — **même en manipulant le client**.
3. Un rafraîchissement de page ou une coupure réseau de moins de 60 s ne fait pas perdre la partie.
4. Le serveur ne peut pas être mis à terre par un client malveillant.
5. Le moteur de règles est couvert par des tests unitaires déterministes.

### Hors périmètre (assumé)

- Authentification, comptes, classements, statistiques persistantes.
- Sons et musique. Les MP3 du projet d'origine sont d'origine non créditée ; on repart d'un design neuf. À reconsidérer après le MVP, avec des sons sous licence claire et chargés en différé.
- Bots / mode solo.
- Plus de 4 joueurs.
- Scalabilité horizontale. L'état est en mémoire, le service tourne en **une seule instance**. Un redémarrage perd les parties en cours ; c'est un compromis accepté à ce volume.
- Contestation du +4 (règle Mattel stricte) : nécessiterait une UI de bluff et l'inspection de main.

### Décisions prises en amont

| Sujet | Décision |
|---|---|
| Langage | TypeScript, serveur et client |
| Autorité | Serveur autoritaire intégral, client passif |
| Lobby | L'hôte lance la partie quand il veut, dès 2 joueurs présents |
| Déconnexion | Reconnexion par jeton, délai de grâce de 60 s |
| Règles | Officielles + empilement des cartes de pioche |
| Empilement | **Strictement même type** : +2 contre +2, +4 contre +4, aucun croisement |
| Visuel | Design neuf, cartes en SVG (pas de PNG) |
| Déploiement | Image Docker autonome, une seule réplique |

---

## 2. Architecture

### 2.1 Structure du monorepo

```
uno-multiplayer/
├── packages/
│   ├── protocol/          # contrat réseau : types + schémas de validation
│   └── engine/            # moteur de règles pur — 0 dépendance runtime
├── apps/
│   ├── server/            # Fastify + socket.io — orchestration
│   └── web/               # Vite + React 19 — rendu
├── Dockerfile             # multi-stage → image unique
└── compose.yaml           # dev local
```

Gestion via **npm workspaces** : suffisant à 4 packages, aucun outil supplémentaire à installer ou maintenir.

### 2.2 Approche retenue : « vue + intentions »

Le serveur détient l'état **et calcule les coups légaux**, qu'il inclut dans la vue envoyée à chaque joueur. Le client ne connaît aucune règle : il affiche ce qu'il reçoit et émet des intentions.

Conséquences :

- **Aucune duplication des règles.** Le prototype d'origine dupliquait sa logique de coup 16 fois dans une fonction de 810 lignes, avec des divergences réelles entre copies. Le problème devient structurellement impossible.
- **Aucune désynchronisation possible.** La vue est un état complet et idempotent, pas un delta : il n'y a ni numéro de séquence, ni détection de trou, ni resynchronisation à écrire.
- **Anti-triche par construction.** Les cartes adverses ne transitent jamais sur le réseau, et il n'existe aucune règle côté client à contourner.
- **Bundle client réduit.** Le moteur ne part pas dans le navigateur.

Coût : un aller-retour réseau par coup (30–100 ms), imperceptible en tour par tour.

Le package partagé se réduit donc aux **types du protocole** — ce qui reste le bénéfice principal de TypeScript des deux côtés : le contrat réseau est vérifié à la compilation sur les deux rives.

### 2.3 `packages/engine` — les règles, et rien d'autre

Aucune notion de réseau, de socket ou de joueur connecté. Fonctions pures sur structures immuables.

| Fichier | Responsabilité |
|---|---|
| `types.ts` | `Card`, `Color`, `Seat`, `GameState`, `Move`, `RuleViolation` |
| `deck.ts` | `buildDeck()`, `shuffle(deck, rng)`, `reshuffleDiscard(state)` |
| `rules.ts` | `isPlayable(card, state)`, `legalMoves(state, seat)` |
| `reducer.ts` | `applyMove(state, seat, move): Result<GameState, RuleViolation>` |
| `rng.ts` | PRNG seedé (mulberry32) |

Trois invariants de conception :

**`applyMove` ne lève jamais d'exception.** Elle retourne un `Result` en union discriminée. Un coup illégal est une valeur de retour, jamais un crash. C'est ce qui rend impossible la classe de DoS présente dans le prototype (un `TypeError` dans un handler socket tuait le process entier).

**Le RNG est seedé et la graine vit dans l'état.** Une partie est intégralement rejouable depuis `(seed, moves[])` : tests déterministes, et reproduction d'un bug de prod depuis les logs. C'est aussi la réponse au bug de mutation du paquet global : l'état est immuable, il n'existe plus de paquet partagé à corrompre.

**Les sièges sont stables.** `seats: Seat[]` indexés 0..3, chacun avec un `status`. Un joueur qui part ne provoque aucune réindexation : l'avancement de tour saute les sièges non actifs. Ça supprime une classe entière de bugs d'index — dont celui qui produisait deux « Player 2 » dans la même room.

### 2.4 Modèle de données du moteur

```ts
type Color = 'R' | 'G' | 'B' | 'Y'

type Card =
  | { id: CardId; kind: 'number';  color: Color; value: 0|1|2|3|4|5|6|7|8|9 }
  | { id: CardId; kind: 'skip' | 'reverse' | 'draw2'; color: Color }
  | { id: CardId; kind: 'wild' | 'wild4' }

type SeatStatus = 'active' | 'disconnected' | 'left'

type Seat = {
  index: 0 | 1 | 2 | 3
  name: string
  status: SeatStatus
  hand: Card[]
  unoCalled: boolean      // réinitialisé au début de chaque tour de ce siège
}

type GameState = {
  seats: Seat[]
  currentSeat: number
  direction: 1 | -1
  drawPile: Card[]
  discardPile: Card[]     // le dessus est le dernier élément
  currentColor: Color     // distinct de la couleur de la carte du dessus (cas des jokers)
  pendingDraw: { amount: number; kind: 'draw2' | 'draw4' } | null
  rngState: number
  phase: 'playing' | 'finished'
  winner: number | null
}

type Move =
  | { type: 'play'; cardId: CardId; chosenColor?: Color }
  | { type: 'draw' }              // pioche volontaire (aucune dette en cours)
  | { type: 'acceptDraw' }        // encaisse pendingDraw
  | { type: 'callUno' }
```

**Chaque carte porte un `id` unique et stable**, attribué à la construction du paquet (`'R7#1'`, `'R7#2'`, `'W#3'`…). Un coup référence un `cardId`, jamais un index de main ni une valeur de carte : les indices sont fragiles si l'affichage diverge, et les valeurs sont ambiguës puisque le paquet contient des doublons.

`currentColor` est volontairement séparé de la carte du dessus : après un joker, la couleur en cours n'est pas celle de la carte visible. Le prototype confondait les deux et dérivait la couleur par `charAt()`, ce qui produisait `currentColor = 'W'`.

### 2.5 `packages/protocol` — le contrat réseau

Les événements dans les deux sens, avec un **schéma de validation par payload entrant** (Zod). Importé par le serveur et le client : contrat vérifié à la compilation des deux côtés, validé à l'exécution côté serveur. C'est la couche entièrement absente du prototype.

### 2.6 `apps/server` — l'orchestration

| Module | Responsabilité |
|---|---|
| `RoomManager` | `Map<roomCode, Room>`, création, jonction, purge des rooms vides |
| `Room` | Un lobby *ou* une partie : sièges, hôte, `GameState`, timers de grâce |
| `handlers` | Validation du payload → délégation à `Room` → diffusion des vues |
| `rateLimit` | Token bucket par socket |
| `views` | `redactFor(state, seat): PlayerView` — le filtre anti-fuite |
| `http` | Fastify : fichiers statiques, fallback SPA, `/healthz` |

`Room` est le seul module qui connaît à la fois les règles et le réseau, et il ne fait qu'appeler le moteur. **Les handlers ne contiennent aucune logique de jeu.**

### 2.7 `apps/web` — le rendu

`useGameSocket` est le **seul** point de contact avec la socket : instance dans un `useRef`, `socket.disconnect()` au démontage, listeners retirés nommément. Pas de variable socket au niveau module.

Composants : `Table` (grille CSS 4 sièges), `Hand`, `Card` (composant SVG paramétré par `kind`/`color`/`value` — un composant, pas 54 fichiers), `DiscardPile`, `ColorPicker`, `Chat`, `Toaster`, `Lobby`.

`ColorPicker` et `Toaster` remplacent `prompt()` et `alert()`. Ces deux appels bloquaient le thread JS et causaient deux crashes dans le prototype : `prompt()` annulé retournait `null` (puis `.toUpperCase()` levait), et une couleur invalide saisie à la main bloquait la partie définitivement.

---

## 3. Flux de données et cycle de vie

### 3.1 Cycle de vie d'une room

```
CREATE ──> LOBBY ──(hôte lance, ≥2 joueurs)──> PLAYING ──> FINISHED
             │                                    │            │
             │                                    │            └─(hôte relance)─> PLAYING
             └──────────── purge si vide ─────────┴── purge si vide
```

- **Code de room** : 6 caractères tirés par `crypto.randomInt` sur un alphabet non ambigu (sans `O`, `0`, `I`, `1`), soit ~1 milliard de combinaisons. Le prototype utilisait `Math.random`, donc des codes prédictibles.
- **Hôte** : premier siège occupé. S'il quitte, le rôle passe au siège actif d'index le plus bas.
- **Purge** : une room sans aucun socket connecté et dont tous les délais de grâce ont expiré est supprimée de la `Map`. Plafond global de rooms (`MAX_ROOMS`) pour borner la mémoire.

### 3.2 Protocole

**Client → serveur** (tous les payloads validés par schéma) :

| Événement | Payload | Réponse |
|---|---|---|
| `room:create` | `{ playerName }` | `{ roomCode, sessionToken, seat }` |
| `room:join` | `{ roomCode, playerName }` | `{ sessionToken, seat }` \| `{ error }` |
| `room:rejoin` | `{ roomCode, sessionToken }` | `{ seat }` \| `{ error }` |
| `game:start` | — | `{ error }` si non-hôte ou < 2 joueurs |
| `game:move` | `Move` | `{ error }` si illégal |
| `chat:send` | `{ text }` | — |

**Serveur → client** :

| Événement | Contenu |
|---|---|
| `room:state` | Composition du lobby : sièges, noms, hôte, statuts |
| `game:view` | `PlayerView` — **par socket**, filtrée pour ce siège |
| `game:event` | Fil d'événements pour animations et journal (« Siège 2 a joué +2 ») |
| `chat:message` | `{ seat, name, text }` |
| `error` | `{ code, message }` |

### 3.3 La vue par joueur

```ts
type PlayerView = {
  you:        { seat: number; hand: Card[]; legalMoves: Move[] }
  opponents:  { seat: number; name: string; handCount: number; status: SeatStatus }[]
  discardTop: Card
  currentColor: Color
  pendingDraw: { amount: number; kind: 'draw2' | 'draw4' } | null
  currentSeat: number
  direction:  1 | -1
  drawPileCount: number
  phase: 'playing' | 'finished'
  winner: number | null
}
```

`opponents` n'expose qu'un **compte** de cartes, jamais leur contenu. C'est la correction structurelle de la fuite d'information du prototype, qui envoyait les deux mains complètes et la pioche entière aux deux clients — le masquage n'y étant qu'une image de dos affichée en CSS.

### 3.4 Traitement d'un coup

1. Le client émet `game:move` avec un `Move` **issu de `legalMoves`** reçu dans sa vue.
2. Serveur : token bucket → validation de schéma → résolution `socket → (room, seat)` → vérification que c'est bien son tour → `applyMove`.
3. Résultat `Err` : émission d'un `error` **à ce socket seul**, aucun changement d'état.
4. Résultat `Ok` : remplacement de l'état de la room, puis pour chaque socket connecté émission de `game:view` avec sa propre redaction, et diffusion d'un `game:event` pour l'animation et le journal.

La vue est **poussée, jamais tirée**. Le client n'a aucune requête d'état à faire.

Comme le client renvoie un coup pris dans `legalMoves`, il ne peut pas même en construire un de forme invalide. La vérification serveur reste évidemment appliquée : elle est la seule autorité.

### 3.5 Règles — points à trancher explicitement

Chaque point ci-dessous était source d'ambiguïté ou de bug dans le prototype.

**Carte de départ.** On prend la **première carte numérique en partant du dessus** du paquet mélangé ; les cartes action rencontrées avant elle restent en place dans la pioche. Déterministe, sans boucle, sans tirage aléatoire supplémentaire. Le prototype tirait un index aléatoire dans une boucle `while(true)` non bornée, avec un `94` codé en dur : gel de l'onglet possible, et index hors bornes si le paquet changeait.

**Reverse à 2 joueurs actifs.** Il agit comme un **skip** (règle officielle) : le tour revient au joueur qui l'a posé. À 3 ou 4, il inverse `direction`. Le prototype traitait le reverse comme une carte numérique, donc sans aucun effet.

**Empilement — strictement même type.** Quand `pendingDraw !== null`, les seuls coups légaux pour le joueur dont c'est le tour sont :
- jouer une carte du **même type** que `pendingDraw.kind` (+2 sur +2, +4 sur +4 — aucun croisement), ce qui incrémente `amount` de 2 ou 4 et passe la main ;
- `acceptDraw` : piocher `amount` cartes, `pendingDraw` repasse à `null`, le tour passe.

Quand on renchérit, la couleur en cours n'entre pas en compte : seul le type importe.

**Pioche épuisée.** Dès qu'une pioche est nécessaire et que `drawPile` est vide, `reshuffleDiscard` prend tout `discardPile` **sauf la carte du dessus**, le mélange avec le RNG de l'état, et en fait la nouvelle pioche. Si après recyclage il n'y a toujours pas assez de cartes, la pioche est **plafonnée au disponible** — cas explicitement testé. C'était un crash garanti dans le prototype : `pop()` sur pioche vide puis `.charAt()` sur `undefined`.

**Annonce d'UNO.** `callUno` n'est légal que pendant son propre tour, avant de jouer ; il positionne `unoCalled` pour ce siège. Si un coup fait descendre la main à exactement 1 carte sans que `unoCalled` soit positionné, le siège pioche immédiatement 2 cartes de pénalité. `unoCalled` est remis à `false` au début de chaque tour du siège.

**Victoire.** Le premier joueur dont la main est **vide** gagne, et la partie passe en `finished` immédiatement. Pas de classement des suivants. Le prototype testait `length === 1` avant de retirer la carte jouée, et annonçait dans plusieurs branches le mauvais gagnant par copier-coller.

**Invariant de conservation.** À tout instant, la somme des mains, de `drawPile` et de `discardPile` vaut exactement 108 cartes, toutes d'`id` distinct. Cet invariant est vérifié par un test de propriété (§4.2) et aurait suffi à détecter le bug le plus grave du prototype, où le mélange mutait un tableau de module et amputait le paquet de 15 cartes à chaque partie.

### 3.6 Déconnexion et reconnexion

**Jeton de session.** À la jonction, le serveur génère un `sessionToken` (`crypto.randomUUID`) et le mappe vers `(roomCode, seat)`. Le client le conserve en `localStorage`, indexé par code de room. Ce jeton est l'identité du joueur — **jamais le `socket.id`**, qui change à chaque reconnexion. C'est précisément ce qui manquait : dans le prototype, l'identité était dérivée de l'ordre d'arrivée.

**À la déconnexion** : `seat.status = 'disconnected'`, démarrage d'un timer de 60 s, diffusion aux autres. Si c'est son tour, le serveur joue immédiatement pour lui le coup neutre légal (`acceptDraw` s'il y a une dette, sinon `draw` puis passage de tour) — la partie ne se bloque pas.

**Reconnexion dans le délai** (`room:rejoin` avec jeton valide) : `status = 'active'`, timer annulé, vue complète envoyée. Le joueur retrouve sa main exacte.

**Expiration du délai** : `status = 'left'`, sa main est remise dans la pioche et mélangée, diffusion aux autres. **S'il reste moins de 2 sièges actifs, la partie passe en `finished` et est annulée** (aucun vainqueur déclaré).

En lobby, un départ libère simplement le siège ; s'il s'agissait de l'hôte, le rôle est transféré.

---

## 4. Gestion d'erreurs, sécurité, tests

### 4.1 Gestion d'erreurs

| Couche | Stratégie |
|---|---|
| Moteur | `Result` en union discriminée, **jamais d'exception** |
| Handlers | Chacun encapsulé : échec de validation → événement `error` à l'émetteur, log en `warn`, jamais de propagation |
| Process | `uncaughtException` et `unhandledRejection` → log puis arrêt propre. Filet totalement absent du prototype, où un payload malformé suffisait à tuer le service |
| Client | Toasts d'erreur, bandeau de reconnexion, aucun `alert()` |

### 4.2 Sécurité

**L'anti-triche est structurel, pas défensif** : les coups légaux viennent du serveur, les mains sont filtrées, chaque coup est revalidé. Il n'existe aucune règle côté client à subvertir.

| Mesure | Détail |
|---|---|
| Rate limiting | Token bucket par socket : 20 coups / 10 s, 5 messages / 10 s. Dépassement → `error` ; abus répété → déconnexion |
| Validation | Tout payload entrant passe par un schéma. `playerName` ≤ 20 caractères, `text` ≤ 200, `roomCode` exactement 6 caractères de l'alphabet autorisé |
| Bornes mémoire | Plafond `MAX_ROOMS`, plafond de joueurs par room, historique de chat borné par room |
| CORS | Allowlist explicite d'origines via variable d'environnement — pas de `cors()` nu |
| En-têtes | `@fastify/helmet` avec CSP |
| Codes de room | `crypto.randomInt`, alphabet non ambigu — pas `Math.random` |
| Jetons | UUID opaques, valables pour une seule paire (room, siège) |

Le chat est rendu comme du texte par React (échappement par défaut) ; la limite de longueur côté serveur couvre le volet déni de service.

### 4.3 Tests

| Niveau | Outil | Portée |
|---|---|---|
| Unitaire moteur | Vitest | Matrice complète des règles : jouabilité, empilement même-type-uniquement, reverse à 2 joueurs, pénalité UNO, recyclage de la défausse, pioche insuffisante, détection de victoire, saut des sièges inactifs |
| Propriété | Vitest + fast-check | Depuis tout état atteignable, appliquer n'importe quel coup de `legalMoves` produit un état valide et **conserve les 108 cartes** |
| Intégration serveur | Vitest | Cycle de vie de room, reconnexion dans et hors délai, transfert d'hôte, rate limiting, rejet des coups hors tour |
| E2E | Playwright | 3 contextes navigateur, partie complète, dont un joueur qui rafraîchit en pleine partie et reprend sa place |

Le moteur étant constitué de fonctions pures sur un RNG seedé, chaque situation de règle est un test d'une poignée de lignes, sans réseau ni React. C'est l'intérêt principal de l'isoler dans son propre package.

CI GitHub Actions : `lint` → `typecheck` → `test` → `build` → `docker build`.

### 4.4 Déploiement

Dockerfile multi-stage :
1. **build** : `npm ci`, build de `protocol`, `engine`, `web`, `server`
2. **runtime** : `node:22-alpine`, utilisateur non-root, dépendances de production uniquement, `dist` du serveur et build statique du client

Fastify sert les assets, le fallback SPA et `/healthz`. Arrêt propre sur `SIGTERM` : notification des rooms puis fermeture des sockets.

| Variable | Rôle |
|---|---|
| `PORT` | Port d'écoute |
| `NODE_ENV` | Mode |
| `CORS_ORIGIN` | Allowlist d'origines |
| `GRACE_PERIOD_MS` | Délai de reconnexion (défaut 60000) |
| `MAX_ROOMS` | Plafond de rooms simultanées |

**Une seule réplique.** L'état vit en mémoire : il n'y a ni sticky sessions ni adaptateur Redis, et il ne faut pas répliquer le service. Contrainte documentée dans le README.
