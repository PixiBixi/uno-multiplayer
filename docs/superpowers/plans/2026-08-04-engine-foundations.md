# Plan A - Fondations et moteur de règles

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer un monorepo TypeScript avec un moteur de règles UNO 2–4 joueurs entièrement testé et un contrat réseau typé, prêts à être consommés par le serveur.

**Architecture:** Monorepo npm workspaces. `packages/engine` contient des fonctions pures sur état immuable avec RNG seedé - aucune I/O, aucune notion de réseau. `packages/protocol` déclare les événements socket et leurs schémas de validation. Aucun code applicatif serveur ou client dans ce plan.

**Tech Stack:** TypeScript 5.7 (strict), Vitest, fast-check, Zod, npm workspaces, Node 22 LTS.

**Spec:** `docs/superpowers/specs/2026-08-04-uno-multiplayer-design.md`

## Global Constraints

- Node 22 LTS. `"engines": { "node": ">=22" }` dans chaque `package.json`.
- TypeScript en mode `strict` avec `noUncheckedIndexedAccess` et `exactOptionalPropertyTypes`.
- `packages/engine` a **zéro dépendance runtime**. Vitest et fast-check sont des `devDependencies`.
- Le moteur ne lève **jamais** d'exception dans son API publique : tout échec est un `Result`.
- Aucun `Math.random`, aucun `Date.now`, aucune mutation d'entrée dans `packages/engine`.
- Le paquet compte exactement **108 cartes**, toutes d'`id` distinct. Cet invariant est vérifié par test.
- Nommage : fichiers en `kebab-case`, types en `PascalCase`, fonctions en `camelCase`.
- Commits en Conventional Commits, un scope par commit (`feat(engine):`, `chore(repo):`).

## Raffinements de la spec actés par ce plan

Deux points que la spec laissait imprécis, tranchés ici et à reporter dans la spec :

1. **`pendingDraw.kind` vaut `'draw2' | 'wild4'`** (et non `'draw2' | 'draw4'`), pour correspondre littéralement au `kind` des cartes. La règle « strictement même type » devient alors une égalité directe `card.kind === pendingDraw.kind`, sans table de correspondance.
2. **Piocher volontairement termine le tour.** La carte piochée rejoint la main et la main passe au joueur suivant. Pas de sous-état « tu peux maintenant jouer la carte que tu viens de piocher », qui aurait ajouté une phase intermédiaire à l'état pour un gain de confort marginal.

## Structure de fichiers

| Fichier | Responsabilité |
|---|---|
| `package.json` | Racine workspaces, scripts agrégés |
| `tsconfig.base.json` | Options TS partagées |
| `vitest.config.ts` | Configuration de test racine |
| `eslint.config.js` | Lint plat ESLint 9 |
| `packages/engine/src/types.ts` | `Card`, `Color`, `Seat`, `GameState`, `Move`, `RuleViolation`, `Result` |
| `packages/engine/src/rng.ts` | `nextRandom`, `nextInt`, `shuffle` - PRNG pur seedé |
| `packages/engine/src/deck.ts` | `buildDeck`, `takeFromTop`, `reshuffleDiscard` |
| `packages/engine/src/init.ts` | `initGame` |
| `packages/engine/src/rules.ts` | `isPlayable`, `legalMoves`, `activeCount`, `advance` |
| `packages/engine/src/reducer.ts` | `applyMove` |
| `packages/engine/src/index.ts` | Surface publique du package |
| `packages/protocol/src/events.ts` | Types des événements dans les deux sens |
| `packages/protocol/src/schemas.ts` | Schémas Zod des payloads entrants |
| `packages/protocol/src/views.ts` | `PlayerView`, `LobbyView` |
| `packages/protocol/src/index.ts` | Surface publique du package |

---

### Task 1: Squelette du monorepo

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.js`, `.gitignore`, `.nvmrc`, `.editorconfig`
- Create: `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/src/index.ts`
- Test: `packages/engine/src/smoke.test.ts`

**Interfaces:**
- Consumes: rien
- Produces: workspace `@uno/engine` résolvable ; scripts racine `npm run typecheck`, `npm test`, `npm run lint`

- [ ] **Step 1: Écrire le test de fumée**

`packages/engine/src/smoke.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION } from './index.js'

describe('engine package', () => {
  it('exposes its version', () => {
    expect(ENGINE_VERSION).toBe('0.1.0')
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test`
Expected: échec - ni le workspace ni le module n'existent encore.

- [ ] **Step 3: Créer les fichiers de configuration**

`.nvmrc` :

```
22
```

`.gitignore` :

```
node_modules/
dist/
coverage/
*.tsbuildinfo
.DS_Store
```

`.editorconfig` :

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

`package.json` :

```json
{
  "name": "uno-multiplayer",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "typecheck": "tsc --build --verbose",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@eslint/js": "^9.17.0",
    "eslint": "^9.17.0",
    "prettier": "^3.4.2",
    "typescript": "^5.7.2",
    "typescript-eslint": "^8.18.0",
    "vitest": "^2.1.8"
  }
}
```

`tsconfig.base.json` :

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "skipLibCheck": true
  }
}
```

`vitest.config.ts` :

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['packages/*/src/**'] },
  },
})
```

`eslint.config.js` :

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['packages/engine/src/**'],
    rules: {
      'no-restricted-globals': ['error', { name: 'Math', message: 'Use rng.ts helpers.' }],
    },
  },
)
```

- [ ] **Step 4: Créer le package engine**

`packages/engine/package.json` :

```json
{
  "name": "@uno/engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc --build" }
}
```

`packages/engine/tsconfig.json` :

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"]
}
```

`packages/engine/src/index.ts` :

```ts
export const ENGINE_VERSION = '0.1.0'
```

Ajouter à `tsconfig.base.json` un `tsconfig.json` racine de références :

```json
{
  "files": [],
  "references": [{ "path": "packages/engine" }]
}
```

- [ ] **Step 5: Installer et lancer les tests**

Run: `npm install && npm test && npm run typecheck && npm run lint`
Expected: 1 test PASS, typecheck et lint sans erreur.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(repo): scaffold npm workspaces monorepo with TypeScript and Vitest"
```

---

### Task 2: RNG seedé et mélange non mutant

**Files:**
- Create: `packages/engine/src/rng.ts`
- Test: `packages/engine/src/rng.test.ts`

**Interfaces:**
- Consumes: rien
- Produces:
  - `nextRandom(state: number): { value: number; state: number }` - `value` dans `[0, 1)`
  - `nextInt(state: number, maxExclusive: number): { value: number; state: number }`
  - `shuffle<T>(input: readonly T[], state: number): { items: T[]; state: number }`

Toutes ces fonctions sont pures : elles retournent le nouvel état du générateur au lieu de le muter.

- [ ] **Step 1: Écrire les tests qui échouent**

`packages/engine/src/rng.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { nextInt, nextRandom, shuffle } from './rng.js'

describe('nextRandom', () => {
  it('returns a value in [0, 1)', () => {
    let state = 42
    for (let i = 0; i < 1000; i++) {
      const r = nextRandom(state)
      expect(r.value).toBeGreaterThanOrEqual(0)
      expect(r.value).toBeLessThan(1)
      state = r.state
    }
  })

  it('is deterministic for a given state', () => {
    expect(nextRandom(7)).toEqual(nextRandom(7))
  })

  it('advances the state', () => {
    expect(nextRandom(7).state).not.toBe(7)
  })
})

describe('nextInt', () => {
  it('stays within bounds', () => {
    let state = 1
    for (let i = 0; i < 1000; i++) {
      const r = nextInt(state, 5)
      expect(r.value).toBeGreaterThanOrEqual(0)
      expect(r.value).toBeLessThan(5)
      state = r.state
    }
  })
})

describe('shuffle', () => {
  it('does not mutate its input', () => {
    const input = Object.freeze([1, 2, 3, 4, 5])
    expect(() => shuffle(input, 99)).not.toThrow()
    expect(input).toEqual([1, 2, 3, 4, 5])
  })

  it('preserves every element exactly once', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const { items } = shuffle(input, 12345)
    expect([...items].sort((a, b) => a - b)).toEqual(input)
  })

  it('produces the same order for the same seed', () => {
    expect(shuffle([1, 2, 3, 4, 5], 777).items).toEqual(shuffle([1, 2, 3, 4, 5], 777).items)
  })

  it('produces a different order for a different seed', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1).items
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2).items
    expect(a).not.toEqual(b)
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run packages/engine/src/rng.test.ts`
Expected: FAIL - `Cannot find module './rng.js'`.

- [ ] **Step 3: Implémenter le RNG**

`packages/engine/src/rng.ts` :

```ts
/**
 * mulberry32 sous forme purement fonctionnelle : l'état du générateur est
 * une valeur, jamais une variable cachée. Une partie est ainsi rejouable
 * depuis sa seule graine.
 */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0
  let r = next
  r = Math.imul(r ^ (r >>> 15), r | 1)
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296
  return { value, state: next }
}

export function nextInt(state: number, maxExclusive: number): { value: number; state: number } {
  const r = nextRandom(state)
  return { value: Math.floor(r.value * maxExclusive), state: r.state }
}

/** Fisher-Yates sur une copie. L'entrée n'est jamais modifiée. */
export function shuffle<T>(input: readonly T[], state: number): { items: T[]; state: number } {
  const items = [...input]
  let s = state
  for (let i = items.length - 1; i > 0; i--) {
    const r = nextInt(s, i + 1)
    s = r.state
    const a = items[i]
    const b = items[r.value]
    if (a === undefined || b === undefined) continue
    items[i] = b
    items[r.value] = a
  }
  return { items, state: s }
}
```

La règle ESLint `no-restricted-globals` interdit `Math` dans le moteur ; ajouter en tête de `rng.ts` la dérogation ciblée :

```ts
/* eslint-disable no-restricted-globals -- seul point du moteur autorisé à utiliser Math */
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run packages/engine/src/rng.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/rng.ts packages/engine/src/rng.test.ts eslint.config.js
git commit -m "feat(engine): add seeded pure PRNG and non-mutating shuffle"
```

---

### Task 3: Types du domaine

**Files:**
- Create: `packages/engine/src/types.ts`
- Test: `packages/engine/src/types.test.ts`

**Interfaces:**
- Consumes: rien
- Produces: `Color`, `COLORS`, `NumberValue`, `CardId`, `Card`, `SeatStatus`, `Seat`, `PendingDraw`, `GamePhase`, `GameState`, `Move`, `RuleViolation`, `Result<T, E>`, `ok`, `err`

- [ ] **Step 1: Écrire le test qui échoue**

`packages/engine/src/types.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { COLORS, err, ok } from './types.js'

describe('COLORS', () => {
  it('lists the four UNO colours in a stable order', () => {
    expect(COLORS).toEqual(['R', 'G', 'B', 'Y'])
  })
})

describe('Result', () => {
  it('wraps a success', () => {
    expect(ok(3)).toEqual({ okay: true, value: 3 })
  })

  it('wraps a failure', () => {
    expect(err('not_your_turn')).toEqual({ okay: false, error: 'not_your_turn' })
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run packages/engine/src/types.test.ts`
Expected: FAIL - module introuvable.

- [ ] **Step 3: Écrire les types**

`packages/engine/src/types.ts` :

```ts
export type Color = 'R' | 'G' | 'B' | 'Y'
export const COLORS: readonly Color[] = ['R', 'G', 'B', 'Y'] as const

export type NumberValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/** Identifiant unique d'une instance de carte, ex. 'R7#42'. */
export type CardId = string & { readonly __brand: 'CardId' }

export type Card =
  | { id: CardId; kind: 'number'; color: Color; value: NumberValue }
  | { id: CardId; kind: 'skip' | 'reverse' | 'draw2'; color: Color }
  | { id: CardId; kind: 'wild' | 'wild4' }

export type SeatStatus = 'active' | 'disconnected' | 'left'

export type Seat = {
  index: number
  name: string
  status: SeatStatus
  hand: Card[]
  /** Remis à false au début de chaque tour de ce siège. */
  unoCalled: boolean
}

/**
 * Dette de pioche en cours. `kind` reprend littéralement le `kind` de la
 * carte, ce qui fait de la règle « strictement même type » une égalité.
 */
export type PendingDraw = { amount: number; kind: 'draw2' | 'wild4' }

export type GamePhase = 'playing' | 'finished'

export type GameState = {
  seats: Seat[]
  currentSeat: number
  direction: 1 | -1
  /** Le dessus de la pioche est le DERNIER élément. */
  drawPile: Card[]
  /** Le dessus de la défausse est le DERNIER élément. */
  discardPile: Card[]
  /** Distinct de la couleur de la carte du dessus : après un joker, elle diverge. */
  currentColor: Color
  pendingDraw: PendingDraw | null
  rngState: number
  phase: GamePhase
  winner: number | null
}

export type Move =
  | { type: 'play'; cardId: CardId; chosenColor?: Color }
  | { type: 'draw' }
  | { type: 'acceptDraw' }
  | { type: 'callUno' }

export type RuleViolation =
  | 'game_finished'
  | 'not_your_turn'
  | 'illegal_move'
  | 'seat_not_active'

export type Result<T, E> = { okay: true; value: T } | { okay: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ okay: true, value })
export const err = <E>(error: E): Result<never, E> => ({ okay: false, error })
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run packages/engine/src/types.test.ts && npm run typecheck`
Expected: 3 tests PASS, typecheck propre.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/types.ts packages/engine/src/types.test.ts
git commit -m "feat(engine): add domain types with discriminated card union"
```

---

### Task 4: Construction du paquet

**Files:**
- Create: `packages/engine/src/deck.ts`
- Test: `packages/engine/src/deck.test.ts`

**Interfaces:**
- Consumes: `Card`, `CardId`, `Color`, `COLORS`, `NumberValue` (Task 3)
- Produces:
  - `buildDeck(): Card[]` - 108 cartes, dessus en fin de tableau
  - `takeFromTop(pile: readonly Card[], count: number): { taken: Card[]; rest: Card[] }`

- [ ] **Step 1: Écrire les tests qui échouent**

`packages/engine/src/deck.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { buildDeck, takeFromTop } from './deck.js'
import type { Card } from './types.js'

const countBy = (cards: readonly Card[], kind: Card['kind']) =>
  cards.filter((c) => c.kind === kind).length

describe('buildDeck', () => {
  it('builds exactly 108 cards', () => {
    expect(buildDeck()).toHaveLength(108)
  })

  it('gives every card a distinct id', () => {
    const ids = buildDeck().map((c) => c.id)
    expect(new Set(ids).size).toBe(108)
  })

  it('matches the official composition', () => {
    const deck = buildDeck()
    expect(countBy(deck, 'number')).toBe(76)
    expect(countBy(deck, 'skip')).toBe(8)
    expect(countBy(deck, 'reverse')).toBe(8)
    expect(countBy(deck, 'draw2')).toBe(8)
    expect(countBy(deck, 'wild')).toBe(4)
    expect(countBy(deck, 'wild4')).toBe(4)
  })

  it('has one zero and two of each 1-9 per colour', () => {
    const deck = buildDeck()
    const reds = deck.filter((c) => c.kind === 'number' && c.color === 'R')
    expect(reds.filter((c) => c.kind === 'number' && c.value === 0)).toHaveLength(1)
    for (let v = 1; v <= 9; v++) {
      expect(reds.filter((c) => c.kind === 'number' && c.value === v)).toHaveLength(2)
    }
  })

  it('returns a fresh array on every call', () => {
    const a = buildDeck()
    a.pop()
    expect(buildDeck()).toHaveLength(108)
  })
})

describe('takeFromTop', () => {
  it('takes from the end of the pile', () => {
    const deck = buildDeck()
    const top = deck[deck.length - 1]
    const { taken, rest } = takeFromTop(deck, 1)
    expect(taken).toEqual([top])
    expect(rest).toHaveLength(107)
  })

  it('takes several cards, topmost first', () => {
    const deck = buildDeck()
    const { taken } = takeFromTop(deck, 3)
    expect(taken[0]).toEqual(deck[107])
    expect(taken[1]).toEqual(deck[106])
    expect(taken[2]).toEqual(deck[105])
  })

  it('caps at what is available instead of returning undefined holes', () => {
    const { taken, rest } = takeFromTop(buildDeck().slice(0, 2), 5)
    expect(taken).toHaveLength(2)
    expect(rest).toHaveLength(0)
  })

  it('does not mutate its input', () => {
    const deck = buildDeck()
    takeFromTop(deck, 10)
    expect(deck).toHaveLength(108)
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run packages/engine/src/deck.test.ts`
Expected: FAIL - module introuvable.

- [ ] **Step 3: Implémenter le paquet**

`packages/engine/src/deck.ts` :

```ts
import { COLORS, type Card, type CardId, type NumberValue } from './types.js'

/**
 * Composition officielle : par couleur un 0, deux de chaque 1-9, deux skip,
 * deux reverse, deux +2 (25 cartes), soit 100, plus 4 jokers et 4 +4 = 108.
 * Le dessus de la pioche est la FIN du tableau.
 */
export function buildDeck(): Card[] {
  const cards: Card[] = []
  let counter = 0
  const id = (label: string): CardId => `${label}#${++counter}` as CardId

  for (const color of COLORS) {
    cards.push({ id: id(`0${color}`), kind: 'number', color, value: 0 })
    for (let v = 1; v <= 9; v++) {
      const value = v as NumberValue
      cards.push({ id: id(`${v}${color}`), kind: 'number', color, value })
      cards.push({ id: id(`${v}${color}`), kind: 'number', color, value })
    }
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      cards.push({ id: id(`${kind}${color}`), kind, color })
      cards.push({ id: id(`${kind}${color}`), kind, color })
    }
  }
  for (let i = 0; i < 4; i++) cards.push({ id: id('W'), kind: 'wild' })
  for (let i = 0; i < 4; i++) cards.push({ id: id('D4W'), kind: 'wild4' })

  return cards
}

/**
 * Prélève `count` cartes sur le dessus (fin du tableau), la première du
 * résultat étant la plus haute. Plafonne au disponible : jamais de trou
 * `undefined` dans le tableau retourné.
 */
export function takeFromTop(
  pile: readonly Card[],
  count: number,
): { taken: Card[]; rest: Card[] } {
  const n = Math.min(count, pile.length)
  const rest = pile.slice(0, pile.length - n)
  const taken = pile.slice(pile.length - n).reverse()
  return { taken, rest }
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run packages/engine/src/deck.test.ts`
Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/deck.ts packages/engine/src/deck.test.ts
git commit -m "feat(engine): add deck construction and non-mutating top draw"
```

---

### Task 5: Initialisation d'une partie

**Files:**
- Create: `packages/engine/src/init.ts`
- Test: `packages/engine/src/init.test.ts`
- Create: `packages/engine/src/test-helpers.ts`

**Interfaces:**
- Consumes: `buildDeck`, `takeFromTop` (Task 4), `shuffle` (Task 2), types (Task 3)
- Produces:
  - `initGame(options: { names: string[]; seed: number }): Result<GameState, InitError>`
  - `type InitError = 'too_few_players' | 'too_many_players'`
  - `allCards(state: GameState): Card[]` dans `test-helpers.ts`, utilisé par tous les tests d'invariant

- [ ] **Step 1: Écrire les tests qui échouent**

`packages/engine/src/test-helpers.ts` :

```ts
import type { Card, GameState } from './types.js'

/** Toutes les cartes présentes dans l'état, pour l'invariant de conservation. */
export function allCards(state: GameState): Card[] {
  return [...state.seats.flatMap((s) => s.hand), ...state.drawPile, ...state.discardPile]
}

export function expectConservation(state: GameState): void {
  const cards = allCards(state)
  if (cards.length !== 108) {
    throw new Error(`expected 108 cards, found ${cards.length}`)
  }
  const ids = new Set(cards.map((c) => c.id))
  if (ids.size !== 108) {
    throw new Error(`expected 108 distinct ids, found ${ids.size}`)
  }
}
```

`packages/engine/src/init.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { initGame } from './init.js'
import { expectConservation } from './test-helpers.js'

const start = (names: string[], seed = 1) => {
  const r = initGame({ names, seed })
  if (!r.okay) throw new Error(r.error)
  return r.value
}

describe('initGame', () => {
  it('rejects fewer than two players', () => {
    expect(initGame({ names: ['Solo'], seed: 1 })).toEqual({
      okay: false,
      error: 'too_few_players',
    })
  })

  it('rejects more than four players', () => {
    expect(initGame({ names: ['a', 'b', 'c', 'd', 'e'], seed: 1 })).toEqual({
      okay: false,
      error: 'too_many_players',
    })
  })

  it('deals seven cards to every seat', () => {
    const state = start(['a', 'b', 'c', 'd'])
    for (const seat of state.seats) expect(seat.hand).toHaveLength(7)
  })

  it('conserves all 108 cards', () => {
    for (const count of [2, 3, 4]) {
      const names = ['a', 'b', 'c', 'd'].slice(0, count)
      expect(() => expectConservation(start(names))).not.toThrow()
    }
  })

  it('starts from a number card', () => {
    for (let seed = 0; seed < 200; seed++) {
      const state = start(['a', 'b'], seed)
      const top = state.discardPile[state.discardPile.length - 1]
      expect(top?.kind).toBe('number')
    }
  })

  it('sets currentColor to the starting card colour', () => {
    const state = start(['a', 'b'], 5)
    const top = state.discardPile[state.discardPile.length - 1]
    if (top?.kind !== 'number') throw new Error('expected a number card')
    expect(state.currentColor).toBe(top.color)
  })

  it('starts on seat 0, clockwise, with no debt', () => {
    const state = start(['a', 'b', 'c'])
    expect(state.currentSeat).toBe(0)
    expect(state.direction).toBe(1)
    expect(state.pendingDraw).toBeNull()
    expect(state.phase).toBe('playing')
    expect(state.winner).toBeNull()
  })

  it('marks every seat active with uno not called', () => {
    const state = start(['a', 'b', 'c'])
    expect(state.seats.map((s) => s.status)).toEqual(['active', 'active', 'active'])
    expect(state.seats.every((s) => !s.unoCalled)).toBe(true)
  })

  it('is reproducible from its seed', () => {
    expect(start(['a', 'b'], 4242)).toEqual(start(['a', 'b'], 4242))
  })

  it('produces different deals for different seeds', () => {
    expect(start(['a', 'b'], 1).seats[0]?.hand).not.toEqual(start(['a', 'b'], 2).seats[0]?.hand)
  })

  it('leaves exactly one card in the discard pile', () => {
    expect(start(['a', 'b', 'c', 'd']).discardPile).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run packages/engine/src/init.test.ts`
Expected: FAIL - module introuvable.

- [ ] **Step 3: Implémenter l'initialisation**

`packages/engine/src/init.ts` :

```ts
import { buildDeck, takeFromTop } from './deck.js'
import { shuffle } from './rng.js'
import { err, ok, type Card, type GameState, type Result, type Seat } from './types.js'

export type InitError = 'too_few_players' | 'too_many_players'

const HAND_SIZE = 7

export function initGame(options: {
  names: string[]
  seed: number
}): Result<GameState, InitError> {
  const { names, seed } = options
  if (names.length < 2) return err('too_few_players')
  if (names.length > 4) return err('too_many_players')

  const shuffled = shuffle(buildDeck(), seed)
  let pile: Card[] = shuffled.items
  const seats: Seat[] = []

  for (const [index, name] of names.entries()) {
    const dealt = takeFromTop(pile, HAND_SIZE)
    pile = dealt.rest
    seats.push({ index, name, status: 'active', hand: dealt.taken, unoCalled: false })
  }

  // La carte de départ est la première carte numérique en partant du dessus.
  // Déterministe, sans boucle non bornée et sans tirage supplémentaire : les
  // cartes action rencontrées avant elle restent en place dans la pioche.
  let startIndex = -1
  for (let i = pile.length - 1; i >= 0; i--) {
    if (pile[i]?.kind === 'number') {
      startIndex = i
      break
    }
  }
  const startingCard = pile[startIndex]
  if (startIndex === -1 || startingCard === undefined || startingCard.kind !== 'number') {
    // Inatteignable : 76 cartes numériques pour au plus 28 distribuées.
    return err('too_few_players')
  }
  const drawPile = [...pile.slice(0, startIndex), ...pile.slice(startIndex + 1)]

  return ok({
    seats,
    currentSeat: 0,
    direction: 1,
    drawPile,
    discardPile: [startingCard],
    currentColor: startingCard.color,
    pendingDraw: null,
    rngState: shuffled.state,
    phase: 'playing',
    winner: null,
  })
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run packages/engine/src/init.test.ts`
Expected: 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/init.ts packages/engine/src/init.test.ts packages/engine/src/test-helpers.ts
git commit -m "feat(engine): add deterministic game initialisation"
```

---

### Task 6: Jouabilité et coups légaux

**Files:**
- Create: `packages/engine/src/rules.ts`
- Test: `packages/engine/src/rules.test.ts`

**Interfaces:**
- Consumes: types (Task 3)
- Produces:
  - `isPlayable(card: Card, state: GameState): boolean`
  - `legalMoves(state: GameState, seatIndex: number): Move[]`
  - `activeCount(state: GameState): number`
  - `advance(state: GameState, from: number, steps: number): number`

Les jokers sont développés en **un coup par couleur** : le client choisit une couleur en choisissant un coup, et n'a donc aucune saisie libre à valider.

- [ ] **Step 1: Écrire les tests qui échouent**

`packages/engine/src/rules.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { activeCount, advance, isPlayable, legalMoves } from './rules.js'
import type { Card, CardId, Color, GameState, Seat } from './types.js'

const cid = (s: string) => s as CardId
const num = (id: string, color: Color, value: 0 | 3 | 7): Card => ({
  id: cid(id),
  kind: 'number',
  color,
  value,
})
const act = (id: string, kind: 'skip' | 'reverse' | 'draw2', color: Color): Card => ({
  id: cid(id),
  kind,
  color,
})
const wild = (id: string, kind: 'wild' | 'wild4'): Card => ({ id: cid(id), kind })

const seat = (index: number, hand: Card[], over: Partial<Seat> = {}): Seat => ({
  index,
  name: `p${index}`,
  status: 'active',
  hand,
  unoCalled: false,
  ...over,
})

const stateOf = (over: Partial<GameState> = {}): GameState => ({
  seats: [seat(0, []), seat(1, [])],
  currentSeat: 0,
  direction: 1,
  drawPile: [num('d1', 'G', 3)],
  discardPile: [num('t1', 'R', 7)],
  currentColor: 'R',
  pendingDraw: null,
  rngState: 1,
  phase: 'playing',
  winner: null,
  ...over,
})

describe('isPlayable without a debt', () => {
  it('accepts a colour match', () => {
    expect(isPlayable(num('x', 'R', 3), stateOf())).toBe(true)
  })

  it('accepts a number match on a different colour', () => {
    expect(isPlayable(num('x', 'G', 7), stateOf())).toBe(true)
  })

  it('rejects a card matching neither colour nor number', () => {
    expect(isPlayable(num('x', 'G', 3), stateOf())).toBe(false)
  })

  it('always accepts wilds', () => {
    expect(isPlayable(wild('x', 'wild'), stateOf())).toBe(true)
    expect(isPlayable(wild('x', 'wild4'), stateOf())).toBe(true)
  })

  it('accepts an action card of the current colour', () => {
    expect(isPlayable(act('x', 'skip', 'R'), stateOf())).toBe(true)
  })

  it('accepts an action card matching the top action kind', () => {
    const state = stateOf({ discardPile: [act('t', 'skip', 'R')], currentColor: 'R' })
    expect(isPlayable(act('x', 'skip', 'G'), state)).toBe(true)
  })

  it('matches on currentColor, not on the visible card colour', () => {
    const state = stateOf({ discardPile: [wild('t', 'wild')], currentColor: 'B' })
    expect(isPlayable(num('x', 'B', 3), state)).toBe(true)
    expect(isPlayable(num('x', 'R', 3), state)).toBe(false)
  })
})

describe('isPlayable with a debt - strictly same type', () => {
  it('lets a +2 answer a +2', () => {
    const state = stateOf({ pendingDraw: { amount: 2, kind: 'draw2' } })
    expect(isPlayable(act('x', 'draw2', 'G'), state)).toBe(true)
  })

  it('refuses a +4 on a +2', () => {
    const state = stateOf({ pendingDraw: { amount: 2, kind: 'draw2' } })
    expect(isPlayable(wild('x', 'wild4'), state)).toBe(false)
  })

  it('refuses a +2 on a +4', () => {
    const state = stateOf({ pendingDraw: { amount: 4, kind: 'wild4' } })
    expect(isPlayable(act('x', 'draw2', 'R'), state)).toBe(false)
  })

  it('lets a +4 answer a +4', () => {
    const state = stateOf({ pendingDraw: { amount: 4, kind: 'wild4' } })
    expect(isPlayable(wild('x', 'wild4'), state)).toBe(true)
  })

  it('refuses everything else while a debt stands', () => {
    const state = stateOf({ pendingDraw: { amount: 2, kind: 'draw2' } })
    expect(isPlayable(num('x', 'R', 7), state)).toBe(false)
    expect(isPlayable(wild('x', 'wild'), state)).toBe(false)
  })

  it('ignores colour when raising', () => {
    const state = stateOf({ pendingDraw: { amount: 2, kind: 'draw2' }, currentColor: 'R' })
    expect(isPlayable(act('x', 'draw2', 'Y'), state)).toBe(true)
  })
})

describe('legalMoves', () => {
  it('is empty for a seat whose turn it is not', () => {
    expect(legalMoves(stateOf(), 1)).toEqual([])
  })

  it('is empty once the game is finished', () => {
    expect(legalMoves(stateOf({ phase: 'finished' }), 0)).toEqual([])
  })

  it('offers draw when there is no debt', () => {
    const state = stateOf({ seats: [seat(0, [num('a', 'G', 3)]), seat(1, [])] })
    expect(legalMoves(state, 0)).toContainEqual({ type: 'draw' })
  })

  it('offers acceptDraw instead of draw when a debt stands', () => {
    const state = stateOf({
      seats: [seat(0, [num('a', 'G', 3)]), seat(1, [])],
      pendingDraw: { amount: 2, kind: 'draw2' },
    })
    const moves = legalMoves(state, 0)
    expect(moves).toContainEqual({ type: 'acceptDraw' })
    expect(moves).not.toContainEqual({ type: 'draw' })
  })

  it('expands a wild into one move per colour', () => {
    const state = stateOf({ seats: [seat(0, [wild('w', 'wild')]), seat(1, [])] })
    const plays = legalMoves(state, 0).filter((m) => m.type === 'play')
    expect(plays).toHaveLength(4)
    expect(plays.map((m) => (m.type === 'play' ? m.chosenColor : null))).toEqual([
      'R',
      'G',
      'B',
      'Y',
    ])
  })

  it('emits a single move for a coloured card, with no chosenColor', () => {
    const state = stateOf({ seats: [seat(0, [num('a', 'R', 3)]), seat(1, [])] })
    expect(legalMoves(state, 0).filter((m) => m.type === 'play')).toEqual([
      { type: 'play', cardId: cid('a') },
    ])
  })

  it('offers callUno at exactly two cards, once', () => {
    const state = stateOf({
      seats: [seat(0, [num('a', 'R', 3), num('b', 'R', 0)]), seat(1, [])],
    })
    expect(legalMoves(state, 0)).toContainEqual({ type: 'callUno' })
  })

  it('does not offer callUno once already called', () => {
    const state = stateOf({
      seats: [seat(0, [num('a', 'R', 3), num('b', 'R', 0)], { unoCalled: true }), seat(1, [])],
    })
    expect(legalMoves(state, 0)).not.toContainEqual({ type: 'callUno' })
  })

  it('does not offer callUno at three cards', () => {
    const state = stateOf({
      seats: [seat(0, [num('a', 'R', 3), num('b', 'R', 0), num('c', 'R', 7)]), seat(1, [])],
    })
    expect(legalMoves(state, 0)).not.toContainEqual({ type: 'callUno' })
  })

  it('excludes unplayable cards', () => {
    const state = stateOf({ seats: [seat(0, [num('a', 'G', 3)]), seat(1, [])] })
    expect(legalMoves(state, 0).filter((m) => m.type === 'play')).toEqual([])
  })
})

describe('activeCount and advance', () => {
  it('counts only active seats', () => {
    const state = stateOf({
      seats: [seat(0, []), seat(1, [], { status: 'left' }), seat(2, [])],
    })
    expect(activeCount(state)).toBe(2)
  })

  it('advances clockwise', () => {
    const state = stateOf({ seats: [seat(0, []), seat(1, []), seat(2, [])] })
    expect(advance(state, 0, 1)).toBe(1)
  })

  it('advances anticlockwise', () => {
    const state = stateOf({ seats: [seat(0, []), seat(1, []), seat(2, [])], direction: -1 })
    expect(advance(state, 0, 1)).toBe(2)
  })

  it('skips inactive seats', () => {
    const state = stateOf({
      seats: [seat(0, []), seat(1, [], { status: 'disconnected' }), seat(2, [])],
    })
    expect(advance(state, 0, 1)).toBe(2)
  })

  it('wraps around', () => {
    const state = stateOf({ seats: [seat(0, []), seat(1, []), seat(2, [])] })
    expect(advance(state, 2, 1)).toBe(0)
  })

  it('advances two steps for a skip', () => {
    const state = stateOf({ seats: [seat(0, []), seat(1, []), seat(2, [])] })
    expect(advance(state, 0, 2)).toBe(2)
  })

  it('returns the origin seat when it is the only active one', () => {
    const state = stateOf({
      seats: [seat(0, []), seat(1, [], { status: 'left' })],
    })
    expect(advance(state, 0, 1)).toBe(0)
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run packages/engine/src/rules.test.ts`
Expected: FAIL - module introuvable.

- [ ] **Step 3: Implémenter les règles**

`packages/engine/src/rules.ts` :

```ts
import { COLORS, type Card, type GameState, type Move } from './types.js'

export function isPlayable(card: Card, state: GameState): boolean {
  // Une dette en cours ferme tout : seul le même type peut renchérir, quelle
  // que soit la couleur en cours.
  if (state.pendingDraw !== null) return card.kind === state.pendingDraw.kind

  if (card.kind === 'wild' || card.kind === 'wild4') return true

  const top = state.discardPile[state.discardPile.length - 1]
  if (top === undefined) return true

  if (card.color === state.currentColor) return true
  if (card.kind === 'number') return top.kind === 'number' && card.value === top.value
  return top.kind === card.kind
}

export function activeCount(state: GameState): number {
  return state.seats.filter((s) => s.status === 'active').length
}

/**
 * Siège actif situé `steps` crans plus loin dans le sens courant. Les sièges
 * non actifs sont sautés sans réindexation. Si aucun autre siège n'est actif,
 * retourne `from`.
 */
export function advance(state: GameState, from: number, steps: number): number {
  const size = state.seats.length
  if (activeCount(state) <= 1) return from
  let index = from
  for (let step = 0; step < steps; step++) {
    for (let guard = 0; guard < size; guard++) {
      index = (index + state.direction + size) % size
      if (state.seats[index]?.status === 'active') break
    }
  }
  return index
}

export function legalMoves(state: GameState, seatIndex: number): Move[] {
  if (state.phase !== 'playing') return []
  if (state.currentSeat !== seatIndex) return []
  const seat = state.seats[seatIndex]
  if (seat === undefined || seat.status !== 'active') return []

  const moves: Move[] = []
  for (const card of seat.hand) {
    if (!isPlayable(card, state)) continue
    if (card.kind === 'wild' || card.kind === 'wild4') {
      // Un coup par couleur : le choix de couleur est un choix de coup, il n'y
      // a donc aucune saisie libre à valider côté serveur.
      for (const chosenColor of COLORS) moves.push({ type: 'play', cardId: card.id, chosenColor })
    } else {
      moves.push({ type: 'play', cardId: card.id })
    }
  }

  moves.push(state.pendingDraw !== null ? { type: 'acceptDraw' } : { type: 'draw' })
  if (!seat.unoCalled && seat.hand.length === 2) moves.push({ type: 'callUno' })
  return moves
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run packages/engine/src/rules.test.ts`
Expected: 30 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/rules.ts packages/engine/src/rules.test.ts
git commit -m "feat(engine): add playability, legal move enumeration and turn advance"
```

---

### Task 7: Constructeurs d'état pour les tests

**Files:**
- Modify: `packages/engine/src/test-helpers.ts`
- Test: `packages/engine/src/test-helpers.test.ts`

**Interfaces:**
- Consumes: types (Task 3)
- Produces, réutilisés par toutes les suites suivantes :
  - `num(id: string, color: Color, value: NumberValue): Card`
  - `act(id: string, kind: 'skip' | 'reverse' | 'draw2', color: Color): Card`
  - `wild(id: string, kind: 'wild' | 'wild4'): Card`
  - `seatOf(index: number, hand: Card[], over?: Partial<Seat>): Seat`
  - `stateOf(over?: Partial<GameState>): GameState`
  - `handOf(state: GameState, index: number): Card[]`
  - `allCards`, `expectConservation` (déjà présents depuis Task 5)

Ces constructeurs produisent des états **arbitraires**, y compris invalides, afin de tester une règle isolément sans dérouler une partie complète.

- [ ] **Step 1: Écrire le test qui échoue**

`packages/engine/src/test-helpers.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { handOf, num, seatOf, stateOf } from './test-helpers.js'

describe('stateOf', () => {
  it('produces a playable two-seat default', () => {
    const state = stateOf()
    expect(state.seats).toHaveLength(2)
    expect(state.currentSeat).toBe(0)
    expect(state.currentColor).toBe('R')
    expect(state.phase).toBe('playing')
  })

  it('accepts overrides', () => {
    const state = stateOf({ currentColor: 'B', direction: -1 })
    expect(state.currentColor).toBe('B')
    expect(state.direction).toBe(-1)
  })
})

describe('handOf', () => {
  it('returns the hand of the requested seat', () => {
    const state = stateOf({ seats: [seatOf(0, [num('a', 'R', 3)]), seatOf(1, [])] })
    expect(handOf(state, 0).map((c) => c.id)).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run packages/engine/src/test-helpers.test.ts`
Expected: FAIL - `num`, `seatOf`, `stateOf`, `handOf` non exportés.

- [ ] **Step 3: Étendre les helpers**

Remplacer `packages/engine/src/test-helpers.ts` par :

```ts
import type {
  Card,
  CardId,
  Color,
  GameState,
  NumberValue,
  Seat,
} from './types.js'

/** Toutes les cartes présentes dans l'état, pour l'invariant de conservation. */
export function allCards(state: GameState): Card[] {
  return [...state.seats.flatMap((s) => s.hand), ...state.drawPile, ...state.discardPile]
}

export function expectConservation(state: GameState): void {
  const cards = allCards(state)
  if (cards.length !== 108) {
    throw new Error(`expected 108 cards, found ${cards.length}`)
  }
  const ids = new Set(cards.map((c) => c.id))
  if (ids.size !== 108) {
    throw new Error(`expected 108 distinct ids, found ${ids.size}`)
  }
}

const cid = (s: string): CardId => s as CardId

export const num = (id: string, color: Color, value: NumberValue): Card => ({
  id: cid(id),
  kind: 'number',
  color,
  value,
})

export const act = (
  id: string,
  kind: 'skip' | 'reverse' | 'draw2',
  color: Color,
): Card => ({ id: cid(id), kind, color })

export const wild = (id: string, kind: 'wild' | 'wild4'): Card => ({ id: cid(id), kind })

export const seatOf = (index: number, hand: Card[], over: Partial<Seat> = {}): Seat => ({
  index,
  name: `p${index}`,
  status: 'active',
  hand,
  unoCalled: false,
  ...over,
})

/** État arbitraire, éventuellement invalide, pour tester une règle isolément. */
export const stateOf = (over: Partial<GameState> = {}): GameState => ({
  seats: [seatOf(0, []), seatOf(1, [])],
  currentSeat: 0,
  direction: 1,
  drawPile: [num('draw-1', 'G', 3), num('draw-2', 'B', 5)],
  discardPile: [num('top-1', 'R', 7)],
  currentColor: 'R',
  pendingDraw: null,
  rngState: 1,
  phase: 'playing',
  winner: null,
  ...over,
})

export const handOf = (state: GameState, index: number): Card[] =>
  state.seats[index]?.hand ?? []
```

Puis remplacer dans `packages/engine/src/rules.test.ts` les constructeurs locaux par un import de ces helpers, en supprimant les définitions locales `cid`, `num`, `act`, `wild`, `seat`, `stateOf` et en renommant les appels `seat(` en `seatOf(` :

```ts
import { act, num, seatOf, stateOf, wild } from './test-helpers.js'
```

- [ ] **Step 4: Lancer toute la suite pour vérifier qu'elle passe**

Run: `npm test`
Expected: tous les tests PASS, y compris `rules.test.ts` après refactor.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/test-helpers.ts packages/engine/src/test-helpers.test.ts packages/engine/src/rules.test.ts
git commit -m "test(engine): extract shared state builders into test helpers"
```

---

### Task 8: `applyMove` - pioche, annonce et dette

**Files:**
- Create: `packages/engine/src/reducer.ts`
- Test: `packages/engine/src/reducer-draw.test.ts`

**Interfaces:**
- Consumes: `takeFromTop` (Task 4), `shuffle` (Task 2), `activeCount`, `advance`, `legalMoves` (Task 6), types (Task 3)
- Produces:
  - `applyMove(state: GameState, seatIndex: number, move: Move): Result<GameState, RuleViolation>`
  - `UNO_PENALTY = 2` (exporté pour les tests)

`applyMove` valide **une seule fois**, en vérifiant que le coup figure dans `legalMoves`. Aucune revalidation par cas : il ne peut donc pas y avoir de divergence entre ce que le client voit proposé et ce que le serveur accepte.

- [ ] **Step 1: Écrire les tests qui échouent**

`packages/engine/src/reducer-draw.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { applyMove } from './reducer.js'
import { act, handOf, num, seatOf, stateOf, wild } from './test-helpers.js'
import type { GameState, Move, RuleViolation } from './types.js'

const apply = (state: GameState, seat: number, move: Move): GameState => {
  const r = applyMove(state, seat, move)
  if (!r.okay) throw new Error(`unexpected failure: ${r.error}`)
  return r.value
}

const failure = (state: GameState, seat: number, move: Move): RuleViolation => {
  const r = applyMove(state, seat, move)
  if (r.okay) throw new Error('expected a failure')
  return r.error
}

describe('applyMove gate', () => {
  it('refuses to act on a finished game', () => {
    const state = stateOf({ phase: 'finished', winner: 1 })
    expect(failure(state, 0, { type: 'draw' })).toBe('game_finished')
  })

  it('refuses a seat whose turn it is not', () => {
    expect(failure(stateOf(), 1, { type: 'draw' })).toBe('not_your_turn')
  })

  it('refuses a non-active seat', () => {
    const state = stateOf({
      seats: [seatOf(0, [], { status: 'disconnected' }), seatOf(1, [])],
    })
    expect(failure(state, 0, { type: 'draw' })).toBe('seat_not_active')
  })

  it('refuses a card that is not in hand', () => {
    const state = stateOf({ seats: [seatOf(0, [num('a', 'R', 3)]), seatOf(1, [])] })
    expect(failure(state, 0, { type: 'play', cardId: 'ghost' as never })).toBe('illegal_move')
  })

  it('refuses an unplayable card held in hand', () => {
    const state = stateOf({ seats: [seatOf(0, [num('a', 'G', 3)]), seatOf(1, [])] })
    expect(failure(state, 0, { type: 'play', cardId: 'a' as never })).toBe('illegal_move')
  })

  it('never mutates the state it is given', () => {
    const state = stateOf({ seats: [seatOf(0, [num('a', 'R', 3)]), seatOf(1, [])] })
    const before = structuredClone(state)
    apply(state, 0, { type: 'draw' })
    expect(state).toEqual(before)
  })
})

describe('callUno', () => {
  it('flags the seat and keeps the turn', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('a', 'R', 3), num('b', 'R', 0)]), seatOf(1, [])],
    })
    const next = apply(state, 0, { type: 'callUno' })
    expect(next.seats[0]?.unoCalled).toBe(true)
    expect(next.currentSeat).toBe(0)
  })

  it('is refused with three cards in hand', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('a', 'R', 3), num('b', 'R', 0), num('c', 'R', 7)]), seatOf(1, [])],
    })
    expect(failure(state, 0, { type: 'callUno' })).toBe('illegal_move')
  })
})

describe('draw', () => {
  it('adds one card to the hand and passes the turn', () => {
    const state = stateOf({ seats: [seatOf(0, []), seatOf(1, [])] })
    const next = apply(state, 0, { type: 'draw' })
    expect(handOf(next, 0)).toHaveLength(1)
    expect(next.currentSeat).toBe(1)
    expect(next.drawPile).toHaveLength(1)
  })

  it('takes the topmost card of the pile', () => {
    const state = stateOf({ seats: [seatOf(0, []), seatOf(1, [])] })
    const top = state.drawPile[state.drawPile.length - 1]
    expect(handOf(apply(state, 0, { type: 'draw' }), 0)[0]).toEqual(top)
  })

  it('resets unoCalled on the seat that gains the turn', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, [], { unoCalled: true })],
    })
    expect(apply(state, 0, { type: 'draw' }).seats[1]?.unoCalled).toBe(false)
  })

  it('recycles the discard pile when the draw pile is empty', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, [])],
      drawPile: [],
      discardPile: [num('d1', 'R', 3), num('d2', 'G', 5), num('top', 'R', 7)],
    })
    const next = apply(state, 0, { type: 'draw' })
    expect(handOf(next, 0)).toHaveLength(1)
    expect(next.discardPile.map((c) => c.id)).toEqual(['top'])
    expect(next.drawPile).toHaveLength(1)
  })

  it('caps the draw when nothing can be recycled', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, [])],
      drawPile: [],
      discardPile: [num('top', 'R', 7)],
    })
    const next = apply(state, 0, { type: 'draw' })
    expect(handOf(next, 0)).toHaveLength(0)
    expect(next.currentSeat).toBe(1)
  })

  it('is not offered while a debt stands', () => {
    const state = stateOf({ pendingDraw: { amount: 2, kind: 'draw2' } })
    expect(failure(state, 0, { type: 'draw' })).toBe('illegal_move')
  })
})

describe('acceptDraw', () => {
  it('draws the whole debt, clears it and passes the turn', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, [])],
      drawPile: [num('a', 'R', 3), num('b', 'G', 5), num('c', 'B', 7), num('d', 'Y', 0)],
      pendingDraw: { amount: 4, kind: 'wild4' },
    })
    const next = apply(state, 0, { type: 'acceptDraw' })
    expect(handOf(next, 0)).toHaveLength(4)
    expect(next.pendingDraw).toBeNull()
    expect(next.currentSeat).toBe(1)
  })

  it('caps at the cards available', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, [])],
      drawPile: [num('a', 'R', 3)],
      discardPile: [num('top', 'R', 7)],
      pendingDraw: { amount: 6, kind: 'draw2' },
    })
    const next = apply(state, 0, { type: 'acceptDraw' })
    expect(handOf(next, 0)).toHaveLength(1)
    expect(next.pendingDraw).toBeNull()
  })
})

describe('stacking', () => {
  it('raises a +2 debt with another +2 and passes it on', () => {
    const state = stateOf({
      seats: [seatOf(0, [act('a', 'draw2', 'Y'), num('x', 'R', 3)]), seatOf(1, [])],
      pendingDraw: { amount: 2, kind: 'draw2' },
    })
    const next = apply(state, 0, { type: 'play', cardId: 'a' as never })
    expect(next.pendingDraw).toEqual({ amount: 4, kind: 'draw2' })
    expect(next.currentSeat).toBe(1)
  })

  it('raises a +4 debt with another +4', () => {
    const state = stateOf({
      seats: [seatOf(0, [wild('a', 'wild4'), num('x', 'R', 3)]), seatOf(1, [])],
      pendingDraw: { amount: 4, kind: 'wild4' },
    })
    const next = apply(state, 0, { type: 'play', cardId: 'a' as never, chosenColor: 'B' })
    expect(next.pendingDraw).toEqual({ amount: 8, kind: 'wild4' })
    expect(next.currentColor).toBe('B')
  })

  it('refuses a +4 on a +2 debt', () => {
    const state = stateOf({
      seats: [seatOf(0, [wild('a', 'wild4')]), seatOf(1, [])],
      pendingDraw: { amount: 2, kind: 'draw2' },
    })
    expect(failure(state, 0, { type: 'play', cardId: 'a' as never, chosenColor: 'B' })).toBe(
      'illegal_move',
    )
  })

  it('refuses a +2 on a +4 debt', () => {
    const state = stateOf({
      seats: [seatOf(0, [act('a', 'draw2', 'R')]), seatOf(1, [])],
      pendingDraw: { amount: 4, kind: 'wild4' },
    })
    expect(failure(state, 0, { type: 'play', cardId: 'a' as never })).toBe('illegal_move')
  })

  it('opens a debt from a fresh +2', () => {
    const state = stateOf({
      seats: [seatOf(0, [act('a', 'draw2', 'R'), num('x', 'R', 3)]), seatOf(1, [])],
    })
    const next = apply(state, 0, { type: 'play', cardId: 'a' as never })
    expect(next.pendingDraw).toEqual({ amount: 2, kind: 'draw2' })
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run packages/engine/src/reducer-draw.test.ts`
Expected: FAIL - `./reducer.js` introuvable.

- [ ] **Step 3: Implémenter le réducteur**

`packages/engine/src/reducer.ts` :

```ts
import { takeFromTop } from './deck.js'
import { shuffle } from './rng.js'
import { activeCount, advance, legalMoves } from './rules.js'
import {
  err,
  ok,
  type Card,
  type GameState,
  type Move,
  type Result,
  type RuleViolation,
} from './types.js'

export const UNO_PENALTY = 2

function sameMove(a: Move, b: Move): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'play' && b.type === 'play') {
    return a.cardId === b.cardId && a.chosenColor === b.chosenColor
  }
  return true
}

/**
 * Pioche `count` cartes pour un siège, en recyclant la défausse si la pioche
 * s'épuise. Si même le recyclage ne suffit pas, la pioche est plafonnée au
 * disponible plutôt que de produire des trous `undefined`.
 */
function drawInto(state: GameState, seatIndex: number, count: number): GameState {
  let drawPile = state.drawPile
  let discardPile = state.discardPile
  let rngState = state.rngState
  const drawn: Card[] = []

  for (let i = 0; i < count; i++) {
    if (drawPile.length === 0) {
      const top = discardPile[discardPile.length - 1]
      const recyclable = discardPile.slice(0, -1)
      if (top === undefined || recyclable.length === 0) break
      const reshuffled = shuffle(recyclable, rngState)
      drawPile = reshuffled.items
      rngState = reshuffled.state
      discardPile = [top]
    }
    const { taken, rest } = takeFromTop(drawPile, 1)
    const card = taken[0]
    if (card === undefined) break
    drawPile = rest
    drawn.push(card)
  }

  if (drawn.length === 0) return { ...state, drawPile, discardPile, rngState }

  return {
    ...state,
    drawPile,
    discardPile,
    rngState,
    seats: state.seats.map((s) =>
      s.index === seatIndex ? { ...s, hand: [...s.hand, ...drawn] } : s,
    ),
  }
}

/** Donne la main à un siège et remet son drapeau UNO à zéro. */
function beginTurn(state: GameState, seatIndex: number): GameState {
  return {
    ...state,
    currentSeat: seatIndex,
    seats: state.seats.map((s) => (s.index === seatIndex ? { ...s, unoCalled: false } : s)),
  }
}

function applyPlay(
  state: GameState,
  seatIndex: number,
  move: Extract<Move, { type: 'play' }>,
): Result<GameState, RuleViolation> {
  const seat = state.seats[seatIndex]
  if (seat === undefined) return err('not_your_turn')
  const card = seat.hand.find((c) => c.id === move.cardId)
  if (card === undefined) return err('illegal_move')

  const hand = seat.hand.filter((c) => c.id !== move.cardId)
  let next: GameState = {
    ...state,
    seats: state.seats.map((s) => (s.index === seatIndex ? { ...s, hand } : s)),
    discardPile: [...state.discardPile, card],
  }

  let steps = 1
  switch (card.kind) {
    case 'number':
      next = { ...next, currentColor: card.color }
      break
    case 'skip':
      next = { ...next, currentColor: card.color }
      steps = 2
      break
    case 'reverse':
      next = { ...next, currentColor: card.color }
      // À deux joueurs actifs, le reverse agit comme un skip : la main revient
      // à celui qui l'a posé (règle officielle).
      if (activeCount(next) === 2) steps = 2
      else next = { ...next, direction: next.direction === 1 ? -1 : 1 }
      break
    case 'draw2':
      next = {
        ...next,
        currentColor: card.color,
        pendingDraw: { amount: (state.pendingDraw?.amount ?? 0) + 2, kind: 'draw2' },
      }
      break
    case 'wild':
      if (move.chosenColor === undefined) return err('illegal_move')
      next = { ...next, currentColor: move.chosenColor }
      break
    case 'wild4':
      if (move.chosenColor === undefined) return err('illegal_move')
      next = {
        ...next,
        currentColor: move.chosenColor,
        pendingDraw: { amount: (state.pendingDraw?.amount ?? 0) + 4, kind: 'wild4' },
      }
      break
  }

  // Victoire sur main vide. Vérifiée avant la pénalité : les deux cas sont
  // exclusifs (zéro carte contre exactement une).
  if (hand.length === 0) return ok({ ...next, phase: 'finished', winner: seatIndex })

  // Descendre à une seule carte sans avoir annoncé UNO coûte deux cartes.
  if (hand.length === 1 && !seat.unoCalled) next = drawInto(next, seatIndex, UNO_PENALTY)

  return ok(beginTurn(next, advance(next, seatIndex, steps)))
}

export function applyMove(
  state: GameState,
  seatIndex: number,
  move: Move,
): Result<GameState, RuleViolation> {
  if (state.phase !== 'playing') return err('game_finished')
  if (state.currentSeat !== seatIndex) return err('not_your_turn')
  const seat = state.seats[seatIndex]
  if (seat === undefined) return err('not_your_turn')
  if (seat.status !== 'active') return err('seat_not_active')

  // Unique porte d'entrée : un coup n'est accepté que s'il figure dans
  // legalMoves. Pas de revalidation par cas, donc aucune divergence possible
  // entre ce que le client voit proposé et ce que le serveur accepte.
  if (!legalMoves(state, seatIndex).some((m) => sameMove(m, move))) return err('illegal_move')

  switch (move.type) {
    case 'callUno':
      return ok({
        ...state,
        seats: state.seats.map((s) => (s.index === seatIndex ? { ...s, unoCalled: true } : s)),
      })
    case 'draw': {
      const drawn = drawInto(state, seatIndex, 1)
      return ok(beginTurn(drawn, advance(drawn, seatIndex, 1)))
    }
    case 'acceptDraw': {
      const debt = state.pendingDraw
      if (debt === null) return err('illegal_move')
      const drawn = drawInto({ ...state, pendingDraw: null }, seatIndex, debt.amount)
      return ok(beginTurn(drawn, advance(drawn, seatIndex, 1)))
    }
    case 'play':
      return applyPlay(state, seatIndex, move)
  }
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run packages/engine/src/reducer-draw.test.ts && npm run typecheck`
Expected: 20 tests PASS, typecheck propre.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/reducer.ts packages/engine/src/reducer-draw.test.ts
git commit -m "feat(engine): add applyMove with draw, uno call and draw stacking"
```

---

### Task 9: Effets des cartes action, UNO et victoire

**Files:**
- Test: `packages/engine/src/reducer-play.test.ts`

Aucune modification de `reducer.ts` n'est attendue : ces tests couvrent le code écrit en Task 8. S'ils échouent, corriger `reducer.ts`.

**Interfaces:**
- Consumes: `applyMove`, `UNO_PENALTY` (Task 8), helpers (Task 7)
- Produces: rien

- [ ] **Step 1: Écrire les tests**

`packages/engine/src/reducer-play.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { UNO_PENALTY, applyMove } from './reducer.js'
import { act, handOf, num, seatOf, stateOf, wild } from './test-helpers.js'
import type { CardId, GameState, Move } from './types.js'

const id = (s: string) => s as CardId

const apply = (state: GameState, seat: number, move: Move): GameState => {
  const r = applyMove(state, seat, move)
  if (!r.okay) throw new Error(`unexpected failure: ${r.error}`)
  return r.value
}

const threeSeats = (hand0: GameState['seats'][number]['hand']) =>
  stateOf({ seats: [seatOf(0, hand0), seatOf(1, []), seatOf(2, [])] })

describe('number card', () => {
  it('sets the current colour and passes the turn', () => {
    const state = threeSeats([num('a', 'R', 3), num('x', 'R', 0)])
    const next = apply(state, 0, { type: 'play', cardId: id('a') })
    expect(next.currentColor).toBe('R')
    expect(next.currentSeat).toBe(1)
    expect(next.discardPile[next.discardPile.length - 1]?.id).toBe('a')
    expect(handOf(next, 0).map((c) => c.id)).toEqual(['x'])
  })
})

describe('skip', () => {
  it('skips the next seat with three players', () => {
    const state = threeSeats([act('a', 'skip', 'R'), num('x', 'R', 0)])
    expect(apply(state, 0, { type: 'play', cardId: id('a') }).currentSeat).toBe(2)
  })

  it('returns the turn to the player with two players', () => {
    const state = stateOf({
      seats: [seatOf(0, [act('a', 'skip', 'R'), num('x', 'R', 0)]), seatOf(1, [])],
    })
    expect(apply(state, 0, { type: 'play', cardId: id('a') }).currentSeat).toBe(0)
  })
})

describe('reverse', () => {
  it('flips the direction with three players', () => {
    const state = threeSeats([act('a', 'reverse', 'R'), num('x', 'R', 0)])
    const next = apply(state, 0, { type: 'play', cardId: id('a') })
    expect(next.direction).toBe(-1)
    expect(next.currentSeat).toBe(2)
  })

  it('acts as a skip with two active players, leaving direction unchanged', () => {
    const state = stateOf({
      seats: [seatOf(0, [act('a', 'reverse', 'R'), num('x', 'R', 0)]), seatOf(1, [])],
    })
    const next = apply(state, 0, { type: 'play', cardId: id('a') })
    expect(next.currentSeat).toBe(0)
    expect(next.direction).toBe(1)
  })

  it('acts as a skip when a third seat has left', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [act('a', 'reverse', 'R'), num('x', 'R', 0)]),
        seatOf(1, [], { status: 'left' }),
        seatOf(2, []),
      ],
    })
    expect(apply(state, 0, { type: 'play', cardId: id('a') }).currentSeat).toBe(0)
  })
})

describe('draw2 effect on the next seat', () => {
  it('leaves the debt for the next seat to answer or accept', () => {
    const state = threeSeats([act('a', 'draw2', 'R'), num('x', 'R', 0)])
    const next = apply(state, 0, { type: 'play', cardId: id('a') })
    expect(next.currentSeat).toBe(1)
    expect(next.pendingDraw).toEqual({ amount: 2, kind: 'draw2' })
    expect(handOf(next, 1)).toHaveLength(0)
  })
})

describe('wild', () => {
  it('applies the chosen colour', () => {
    const state = threeSeats([wild('a', 'wild'), num('x', 'R', 0)])
    const next = apply(state, 0, { type: 'play', cardId: id('a'), chosenColor: 'Y' })
    expect(next.currentColor).toBe('Y')
    expect(next.currentSeat).toBe(1)
    expect(next.pendingDraw).toBeNull()
  })
})

describe('wild4', () => {
  it('applies the chosen colour and opens a four-card debt', () => {
    const state = threeSeats([wild('a', 'wild4'), num('x', 'R', 0)])
    const next = apply(state, 0, { type: 'play', cardId: id('a'), chosenColor: 'G' })
    expect(next.currentColor).toBe('G')
    expect(next.pendingDraw).toEqual({ amount: 4, kind: 'wild4' })
    expect(next.currentSeat).toBe(1)
  })
})

describe('uno penalty', () => {
  it('draws two cards when going down to one without calling', () => {
    const state = threeSeats([num('a', 'R', 3), num('b', 'R', 0)])
    const next = apply(state, 0, { type: 'play', cardId: id('a') })
    expect(handOf(next, 0)).toHaveLength(1 + UNO_PENALTY)
  })

  it('draws nothing when uno was called first', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('a', 'R', 3), num('b', 'R', 0)]), seatOf(1, []), seatOf(2, [])],
    })
    const called = apply(state, 0, { type: 'callUno' })
    const next = apply(called, 0, { type: 'play', cardId: id('a') })
    expect(handOf(next, 0).map((c) => c.id)).toEqual(['b'])
  })

  it('does not apply when going from three cards to two', () => {
    const state = threeSeats([num('a', 'R', 3), num('b', 'R', 0), num('c', 'R', 7)])
    expect(handOf(apply(state, 0, { type: 'play', cardId: id('a') }), 0)).toHaveLength(2)
  })
})

describe('victory', () => {
  it('finishes the game when the last card is played', () => {
    const state = threeSeats([num('a', 'R', 3)])
    const next = apply(state, 0, { type: 'play', cardId: id('a') })
    expect(next.phase).toBe('finished')
    expect(next.winner).toBe(0)
    expect(handOf(next, 0)).toHaveLength(0)
  })

  it('applies no uno penalty on the winning card', () => {
    const state = threeSeats([num('a', 'R', 3)])
    expect(handOf(apply(state, 0, { type: 'play', cardId: id('a') }), 0)).toHaveLength(0)
  })

  it('refuses any further move once finished', () => {
    const state = threeSeats([num('a', 'R', 3)])
    const done = apply(state, 0, { type: 'play', cardId: id('a') })
    const after = applyMove(done, 1, { type: 'draw' })
    expect(after).toEqual({ okay: false, error: 'game_finished' })
  })
})

describe('inactive seats', () => {
  it('skips a disconnected seat when passing the turn', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [num('a', 'R', 3), num('x', 'R', 0)]),
        seatOf(1, [], { status: 'disconnected' }),
        seatOf(2, []),
      ],
    })
    expect(apply(state, 0, { type: 'play', cardId: id('a') }).currentSeat).toBe(2)
  })
})
```

- [ ] **Step 2: Lancer les tests**

Run: `npx vitest run packages/engine/src/reducer-play.test.ts`
Expected: 17 tests PASS. En cas d'échec, corriger `reducer.ts` - les tests décrivent le comportement attendu.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/reducer-play.test.ts
git commit -m "test(engine): cover action card effects, uno penalty and victory"
```

---

### Task 10: Test de propriété - conservation des cartes

**Files:**
- Create: `packages/engine/src/invariants.test.ts`
- Modify: `package.json` (ajout de `fast-check`)

**Interfaces:**
- Consumes: `initGame` (Task 5), `legalMoves` (Task 6), `applyMove` (Task 8), `expectConservation` (Task 7)
- Produces: rien

Ce test est le filet le plus important du moteur : il joue des parties entières au hasard et vérifie qu'aucun chemin ne perd ni ne duplique une carte. Il aurait détecté seul le bug le plus grave du prototype, où le mélange mutait un tableau de module et amputait le paquet de 15 cartes par partie.

- [ ] **Step 1: Ajouter fast-check**

Run: `npm install -D fast-check@^3.23.1 -w .`

- [ ] **Step 2: Écrire le test**

`packages/engine/src/invariants.test.ts` :

```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { initGame } from './init.js'
import { applyMove } from './reducer.js'
import { legalMoves } from './rules.js'
import { expectConservation } from './test-helpers.js'
import type { GameState } from './types.js'

/**
 * Joue une partie de bout en bout en choisissant à chaque tour un coup légal,
 * l'indice `pick` servant à varier le choix de façon déterministe.
 */
function playOut(
  seatCount: number,
  seed: number,
  picks: readonly number[],
): { states: GameState[]; final: GameState } {
  const init = initGame({ names: ['a', 'b', 'c', 'd'].slice(0, seatCount), seed })
  if (!init.okay) throw new Error(init.error)

  let state = init.value
  const states: GameState[] = [state]

  for (let turn = 0; turn < 600 && state.phase === 'playing'; turn++) {
    const moves = legalMoves(state, state.currentSeat)
    if (moves.length === 0) break
    const pick = picks[turn % picks.length] ?? 0
    const move = moves[pick % moves.length]
    if (move === undefined) break
    const result = applyMove(state, state.currentSeat, move)
    if (!result.okay) throw new Error(`legal move rejected: ${result.error}`)
    state = result.value
    states.push(state)
  }

  return { states, final: state }
}

describe('card conservation', () => {
  it('holds across randomly played games', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 40 }),
        (seatCount, seed, picks) => {
          const { states } = playOut(seatCount, seed, picks)
          for (const state of states) expectConservation(state)
        },
      ),
      { numRuns: 300 },
    )
  })
})

describe('state validity', () => {
  it('never lets legalMoves produce a move that applyMove rejects', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 40 }),
        (seatCount, seed, picks) => {
          // playOut lève si un coup légal est refusé.
          expect(() => playOut(seatCount, seed, picks)).not.toThrow()
        },
      ),
      { numRuns: 300 },
    )
  })

  it('keeps currentSeat pointing at an active seat while playing', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 40 }),
        (seatCount, seed, picks) => {
          for (const state of playOut(seatCount, seed, picks).states) {
            if (state.phase !== 'playing') continue
            expect(state.seats[state.currentSeat]?.status).toBe('active')
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('never leaves a negative or fractional debt', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 40 }),
        (seatCount, seed, picks) => {
          for (const state of playOut(seatCount, seed, picks).states) {
            if (state.pendingDraw === null) continue
            expect(state.pendingDraw.amount).toBeGreaterThan(0)
            expect(Number.isInteger(state.pendingDraw.amount)).toBe(true)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('reaches a finished game for most seeds', () => {
    let finished = 0
    for (let seed = 0; seed < 40; seed++) {
      if (playOut(3, seed, [0, 1, 2, 3, 5]).final.phase === 'finished') finished++
    }
    expect(finished).toBeGreaterThan(20)
  })

  it('is fully reproducible from seed and picks', () => {
    const a = playOut(4, 31337, [0, 2, 1, 4]).final
    const b = playOut(4, 31337, [0, 2, 1, 4]).final
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 3: Lancer les tests**

Run: `npx vitest run packages/engine/src/invariants.test.ts`
Expected: 6 tests PASS. Un échec ici signale un vrai bug du moteur - fast-check imprime le contre-exemple minimal ; le reproduire dans un test unitaire dédié avant de corriger.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json packages/engine/src/invariants.test.ts
git commit -m "test(engine): add property-based card conservation and validity invariants"
```

---

### Task 11: Surface publique du moteur

**Files:**
- Modify: `packages/engine/src/index.ts`
- Delete: `packages/engine/src/smoke.test.ts`
- Test: `packages/engine/src/index.test.ts`

**Interfaces:**
- Consumes: tout le moteur
- Produces: l'API que `apps/server` consommera - `initGame`, `applyMove`, `legalMoves`, `isPlayable`, `activeCount`, `buildDeck`, et tous les types

- [ ] **Step 1: Écrire le test qui échoue**

`packages/engine/src/index.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import * as engine from './index.js'

describe('public surface', () => {
  it('exports the functions the server needs', () => {
    expect(typeof engine.initGame).toBe('function')
    expect(typeof engine.applyMove).toBe('function')
    expect(typeof engine.legalMoves).toBe('function')
    expect(typeof engine.isPlayable).toBe('function')
    expect(typeof engine.activeCount).toBe('function')
    expect(typeof engine.buildDeck).toBe('function')
    expect(engine.COLORS).toEqual(['R', 'G', 'B', 'Y'])
  })

  it('does not leak test helpers', () => {
    expect('stateOf' in engine).toBe(false)
    expect('expectConservation' in engine).toBe(false)
  })

  it('runs a full turn through the public API only', () => {
    const init = engine.initGame({ names: ['a', 'b'], seed: 7 })
    if (!init.okay) throw new Error(init.error)
    const moves = engine.legalMoves(init.value, 0)
    expect(moves.length).toBeGreaterThan(0)
    const first = moves[0]
    if (first === undefined) throw new Error('expected at least one legal move')
    const next = engine.applyMove(init.value, 0, first)
    expect(next.okay).toBe(true)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run packages/engine/src/index.test.ts`
Expected: FAIL - `initGame` n'est pas exporté depuis `index.ts`.

- [ ] **Step 3: Écrire la surface publique**

`packages/engine/src/index.ts` :

```ts
export const ENGINE_VERSION = '0.1.0'

export { buildDeck, takeFromTop } from './deck.js'
export { initGame, type InitError } from './init.js'
export { applyMove, UNO_PENALTY } from './reducer.js'
export { activeCount, advance, isPlayable, legalMoves } from './rules.js'
export { nextInt, nextRandom, shuffle } from './rng.js'
export {
  COLORS,
  err,
  ok,
  type Card,
  type CardId,
  type Color,
  type GamePhase,
  type GameState,
  type Move,
  type NumberValue,
  type PendingDraw,
  type Result,
  type RuleViolation,
  type Seat,
  type SeatStatus,
} from './types.js'
```

Supprimer `packages/engine/src/smoke.test.ts`, devenu redondant :

```bash
rm packages/engine/src/smoke.test.ts
```

- [ ] **Step 4: Lancer toute la suite**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tout PASS. `test-helpers.ts` n'est pas exporté depuis `index.ts` : il reste interne au package.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/index.ts packages/engine/src/index.test.ts
git rm packages/engine/src/smoke.test.ts
git commit -m "feat(engine): expose public API surface"
```

---

### Task 12: `packages/protocol` - vues et événements

**Files:**
- Create: `packages/protocol/package.json`, `packages/protocol/tsconfig.json`
- Create: `packages/protocol/src/views.ts`, `packages/protocol/src/events.ts`, `packages/protocol/src/index.ts`
- Modify: `tsconfig.json` (référence de projet)
- Test: `packages/protocol/src/views.test.ts`

**Interfaces:**
- Consumes: `Card`, `Color`, `Move`, `SeatStatus`, `GamePhase` (Task 11)
- Produces: `PlayerView`, `LobbyView`, `ClientToServer`, `ServerToClient`, `ErrorCode`

`redactFor` n'est **pas** ici : c'est du code serveur, il vivra dans `apps/server` (plan B). Ce package ne contient que des déclarations.

- [ ] **Step 1: Écrire le test qui échoue**

`packages/protocol/src/views.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { MAX_CHAT_LENGTH, MAX_NAME_LENGTH, MAX_SEATS, ROOM_CODE_LENGTH } from './index.js'

describe('protocol limits', () => {
  it('publishes the bounds the server enforces', () => {
    expect(ROOM_CODE_LENGTH).toBe(6)
    expect(MAX_SEATS).toBe(4)
    expect(MAX_NAME_LENGTH).toBe(20)
    expect(MAX_CHAT_LENGTH).toBe(200)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run packages/protocol/src/views.test.ts`
Expected: FAIL - le package n'existe pas.

- [ ] **Step 3: Créer le package**

`packages/protocol/package.json` :

```json
{
  "name": "@uno/protocol",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc --build" },
  "dependencies": { "@uno/engine": "*", "zod": "^3.24.1" }
}
```

`packages/protocol/tsconfig.json` :

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"],
  "references": [{ "path": "../engine" }]
}
```

Ajouter la référence dans le `tsconfig.json` racine :

```json
{
  "files": [],
  "references": [{ "path": "packages/engine" }, { "path": "packages/protocol" }]
}
```

`packages/protocol/src/views.ts` :

```ts
import type { Card, Color, GamePhase, Move, SeatStatus } from '@uno/engine'

export const ROOM_CODE_LENGTH = 6
export const MAX_SEATS = 4
export const MIN_SEATS = 2
export const MAX_NAME_LENGTH = 20
export const MAX_CHAT_LENGTH = 200

/** Alphabet sans caractères ambigus : ni O/0 ni I/1. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * Tout ce qu'UN joueur reçoit. `opponents` n'expose qu'un compte de cartes :
 * le contenu des mains adverses ne transite jamais sur le réseau.
 */
export type PlayerView = {
  you: { seat: number; hand: Card[]; legalMoves: Move[] }
  opponents: { seat: number; name: string; handCount: number; status: SeatStatus }[]
  discardTop: Card
  currentColor: Color
  pendingDraw: { amount: number; kind: 'draw2' | 'wild4' } | null
  currentSeat: number
  direction: 1 | -1
  drawPileCount: number
  phase: GamePhase
  winner: number | null
}

export type LobbyView = {
  roomCode: string
  hostSeat: number
  seats: { seat: number; name: string; status: SeatStatus }[]
  canStart: boolean
}
```

`packages/protocol/src/events.ts` :

```ts
import type { Move } from '@uno/engine'
import type { LobbyView, PlayerView } from './views.js'

export type ErrorCode =
  | 'room_not_found'
  | 'room_full'
  | 'invalid_payload'
  | 'not_host'
  | 'too_few_players'
  | 'game_already_started'
  | 'game_not_started'
  | 'illegal_move'
  | 'not_your_turn'
  | 'rate_limited'
  | 'invalid_session'
  | 'server_full'

export type GameEvent =
  | { type: 'cardPlayed'; seat: number; card: Card_ }
  | { type: 'cardsDrawn'; seat: number; count: number }
  | { type: 'unoCalled'; seat: number }
  | { type: 'unoPenalty'; seat: number; count: number }
  | { type: 'seatDisconnected'; seat: number }
  | { type: 'seatReconnected'; seat: number }
  | { type: 'seatLeft'; seat: number }
  | { type: 'gameOver'; winner: number | null }

// Réexport local pour éviter une dépendance de type circulaire à la lecture.
type Card_ = import('@uno/engine').Card

export type ClientToServer = {
  'room:create': (
    payload: { playerName: string },
    ack: (r: { ok: true; roomCode: string; sessionToken: string; seat: number } | { ok: false; error: ErrorCode }) => void,
  ) => void
  'room:join': (
    payload: { roomCode: string; playerName: string },
    ack: (r: { ok: true; sessionToken: string; seat: number } | { ok: false; error: ErrorCode }) => void,
  ) => void
  'room:rejoin': (
    payload: { roomCode: string; sessionToken: string },
    ack: (r: { ok: true; seat: number } | { ok: false; error: ErrorCode }) => void,
  ) => void
  'game:start': (payload: Record<string, never>, ack: (r: { ok: true } | { ok: false; error: ErrorCode }) => void) => void
  'game:move': (payload: { move: Move }, ack: (r: { ok: true } | { ok: false; error: ErrorCode }) => void) => void
  'chat:send': (payload: { text: string }, ack: (r: { ok: true } | { ok: false; error: ErrorCode }) => void) => void
}

export type ServerToClient = {
  'room:state': (view: LobbyView) => void
  'game:view': (view: PlayerView) => void
  'game:event': (event: GameEvent) => void
  'chat:message': (message: { seat: number; name: string; text: string }) => void
  error: (payload: { code: ErrorCode; message: string }) => void
}
```

`packages/protocol/src/index.ts` :

```ts
export * from './events.js'
export * from './views.js'
export * from './schemas.js'
```

- [ ] **Step 4: Lancer les tests**

Run: `npm install && npx vitest run packages/protocol/src/views.test.ts`
Expected: FAIL sur `./schemas.js` - traité en Task 13. Retirer temporairement la ligne `export * from './schemas.js'` pour valider le reste, puis la remettre en Task 13.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol tsconfig.json package.json package-lock.json
git commit -m "feat(protocol): add player view, lobby view and socket event contract"
```

---

### Task 13: Schémas de validation des payloads

**Files:**
- Create: `packages/protocol/src/schemas.ts`
- Test: `packages/protocol/src/schemas.test.ts`

**Interfaces:**
- Consumes: constantes de `views.ts` (Task 12)
- Produces: `moveSchema`, `roomCreateSchema`, `roomJoinSchema`, `roomRejoinSchema`, `chatSendSchema`, `gameStartSchema`

Cette couche est la contre-mesure directe au déni de service du prototype, où un payload sans `join` préalable suffisait à tuer le process.

- [ ] **Step 1: Écrire les tests qui échouent**

`packages/protocol/src/schemas.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { chatSendSchema, moveSchema, roomJoinSchema, roomCreateSchema } from './schemas.js'

describe('roomCreateSchema', () => {
  it('accepts a normal name', () => {
    expect(roomCreateSchema.safeParse({ playerName: 'Jeremy' }).success).toBe(true)
  })

  it('trims surrounding whitespace', () => {
    const parsed = roomCreateSchema.parse({ playerName: '  Jeremy  ' })
    expect(parsed.playerName).toBe('Jeremy')
  })

  it('rejects an empty name', () => {
    expect(roomCreateSchema.safeParse({ playerName: '   ' }).success).toBe(false)
  })

  it('rejects a name over 20 characters', () => {
    expect(roomCreateSchema.safeParse({ playerName: 'x'.repeat(21) }).success).toBe(false)
  })

  it('rejects a missing name', () => {
    expect(roomCreateSchema.safeParse({}).success).toBe(false)
  })

  it('rejects a non-string name', () => {
    expect(roomCreateSchema.safeParse({ playerName: 42 }).success).toBe(false)
  })
})

describe('roomJoinSchema', () => {
  it('accepts a well-formed code', () => {
    expect(roomJoinSchema.safeParse({ roomCode: 'ABC234', playerName: 'x' }).success).toBe(true)
  })

  it('uppercases the code', () => {
    expect(roomJoinSchema.parse({ roomCode: 'abc234', playerName: 'x' }).roomCode).toBe('ABC234')
  })

  it('rejects a code of the wrong length', () => {
    expect(roomJoinSchema.safeParse({ roomCode: 'ABC23', playerName: 'x' }).success).toBe(false)
  })

  it('rejects ambiguous characters outside the alphabet', () => {
    expect(roomJoinSchema.safeParse({ roomCode: 'ABC01I', playerName: 'x' }).success).toBe(false)
  })
})

describe('chatSendSchema', () => {
  it('accepts a normal message', () => {
    expect(chatSendSchema.safeParse({ text: 'bien joué' }).success).toBe(true)
  })

  it('rejects an empty message', () => {
    expect(chatSendSchema.safeParse({ text: '  ' }).success).toBe(false)
  })

  it('rejects a message over 200 characters', () => {
    expect(chatSendSchema.safeParse({ text: 'x'.repeat(201) }).success).toBe(false)
  })
})

describe('moveSchema', () => {
  it('accepts a plain play', () => {
    expect(moveSchema.safeParse({ type: 'play', cardId: 'R7#3' }).success).toBe(true)
  })

  it('accepts a play with a chosen colour', () => {
    expect(moveSchema.safeParse({ type: 'play', cardId: 'W#101', chosenColor: 'B' }).success).toBe(
      true,
    )
  })

  it('rejects an unknown colour', () => {
    expect(moveSchema.safeParse({ type: 'play', cardId: 'W#101', chosenColor: 'Z' }).success).toBe(
      false,
    )
  })

  it('accepts the parameterless moves', () => {
    expect(moveSchema.safeParse({ type: 'draw' }).success).toBe(true)
    expect(moveSchema.safeParse({ type: 'acceptDraw' }).success).toBe(true)
    expect(moveSchema.safeParse({ type: 'callUno' }).success).toBe(true)
  })

  it('rejects an unknown move type', () => {
    expect(moveSchema.safeParse({ type: 'teleport' }).success).toBe(false)
  })

  it('rejects a cardId that is absurdly long', () => {
    expect(moveSchema.safeParse({ type: 'play', cardId: 'x'.repeat(200) }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run packages/protocol/src/schemas.test.ts`
Expected: FAIL - `./schemas.js` introuvable.

- [ ] **Step 3: Écrire les schémas**

`packages/protocol/src/schemas.ts` :

```ts
import { z } from 'zod'
import {
  MAX_CHAT_LENGTH,
  MAX_NAME_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './views.js'

const roomCode = z
  .string()
  .trim()
  .toUpperCase()
  .length(ROOM_CODE_LENGTH)
  .refine((code) => [...code].every((c) => ROOM_CODE_ALPHABET.includes(c)), {
    message: 'room code contains characters outside the allowed alphabet',
  })

const playerName = z.string().trim().min(1).max(MAX_NAME_LENGTH)

const colorSchema = z.enum(['R', 'G', 'B', 'Y'])

/** Borné : un cardId légitime fait moins de 16 caractères ('reverseR#42'). */
const cardId = z.string().min(1).max(32)

export const moveSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play'), cardId, chosenColor: colorSchema.optional() }),
  z.object({ type: z.literal('draw') }),
  z.object({ type: z.literal('acceptDraw') }),
  z.object({ type: z.literal('callUno') }),
])

export const roomCreateSchema = z.object({ playerName })
export const roomJoinSchema = z.object({ roomCode, playerName })
export const roomRejoinSchema = z.object({ roomCode, sessionToken: z.string().uuid() })
export const gameStartSchema = z.object({})
export const gameMoveSchema = z.object({ move: moveSchema })
export const chatSendSchema = z.object({ text: z.string().trim().min(1).max(MAX_CHAT_LENGTH) })
```

Remettre dans `packages/protocol/src/index.ts` la ligne retirée en Task 12 :

```ts
export * from './schemas.js'
```

- [ ] **Step 4: Lancer toute la suite**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tout PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/schemas.ts packages/protocol/src/schemas.test.ts packages/protocol/src/index.ts
git commit -m "feat(protocol): add Zod schemas for every inbound payload"
```

---

## Critère de fin du plan A

```bash
npm run lint && npm run typecheck && npm test
```

Les trois commandes passent, et :

- `packages/engine` n'a aucune dépendance runtime et ne contient ni `Math.random`, ni `Date.now`, ni mutation d'entrée.
- L'invariant de conservation des 108 cartes tient sur 300 parties jouées au hasard, de 2 à 4 joueurs.
- Aucun coup issu de `legalMoves` n'est refusé par `applyMove`.
- `@uno/protocol` déclare le contrat réseau et valide tout payload entrant.

À ce stade le moteur est une bibliothèque autonome et testée : le plan B (serveur, client, Docker, CI) peut être écrit sur des signatures désormais stables plutôt que supposées.

## Auto-review du plan

**Couverture de la spec.** §2.3 → Tasks 2–11. §2.4 → Task 3. §2.5 → Tasks 12–13. §3.5, chaque règle tranchée : carte de départ → Task 5 ; reverse à 2 → Task 9 ; empilement même type → Tasks 6 et 8 ; pioche épuisée et plafonnement → Task 8 ; UNO et pénalité → Tasks 6, 8, 9 ; victoire → Task 9 ; invariant de conservation → Task 10. §4.1 « jamais d'exception » → `Result` en Tasks 3 et 8. §4.2 validation et bornes → Task 13.

**Hors périmètre du plan A, à traiter dans le plan B** : §2.6 serveur (`RoomManager`, `Room`, handlers, `redactFor`, rate limiting), §2.7 client, §3.1 cycle de vie des rooms, §3.2 câblage des événements, §3.3 production effective des vues, §3.4 traitement d'un coup côté serveur, §3.6 reconnexion et délai de grâce, §4.3 tests d'intégration et E2E, §4.4 Docker et CI.

**Cohérence des types.** `PendingDraw.kind` vaut `'draw2' | 'wild4'` partout (types du moteur, `isPlayable`, `applyMove`, `PlayerView`). `Result` utilise `okay` et non `ok` comme discriminant, `ok`/`err` étant les constructeurs - usage uniforme dans toutes les tasks. `seatOf` est le nom du constructeur de siège dans les tests, `Seat` le type. Le dessus des piles est **toujours** le dernier élément du tableau, en pioche comme en défausse.

