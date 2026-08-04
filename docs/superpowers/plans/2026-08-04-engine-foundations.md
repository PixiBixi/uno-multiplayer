# Plan A — Fondations et moteur de règles

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer un monorepo TypeScript avec un moteur de règles UNO 2–4 joueurs entièrement testé et un contrat réseau typé, prêts à être consommés par le serveur.

**Architecture:** Monorepo npm workspaces. `packages/engine` contient des fonctions pures sur état immuable avec RNG seedé — aucune I/O, aucune notion de réseau. `packages/protocol` déclare les événements socket et leurs schémas de validation. Aucun code applicatif serveur ou client dans ce plan.

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
| `packages/engine/src/rng.ts` | `nextRandom`, `nextInt`, `shuffle` — PRNG pur seedé |
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
Expected: échec — ni le workspace ni le module n'existent encore.

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
  - `nextRandom(state: number): { value: number; state: number }` — `value` dans `[0, 1)`
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
Expected: FAIL — `Cannot find module './rng.js'`.

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
Expected: FAIL — module introuvable.

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
  - `buildDeck(): Card[]` — 108 cartes, dessus en fin de tableau
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
Expected: FAIL — module introuvable.

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
Expected: FAIL — module introuvable.

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

describe('isPlayable with a debt — strictly same type', () => {
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
Expected: FAIL — module introuvable.

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

*(La suite du plan — Task 7 `applyMove`, Task 8 pénalité UNO et victoire, Task 9 test de propriété, Task 10 surface publique, Tasks 11–12 `packages/protocol` — est rédigée dans la section suivante de ce document.)*
