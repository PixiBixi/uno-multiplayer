import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { initGame } from './init.js'
import { applyMove } from './reducer.js'
import { activeCount, legalMoves } from './rules.js'
import { expectConservation } from './test-helpers.js'
import { DEFAULT_TABLE_RULES, type GameState, type Move, type TableRules } from './types.js'

const MAX_TURNS = 600

/**
 * Plays a game end to end, picking a legal move each turn, with the `pick`
 * index varying the choice deterministically.
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

  for (let turn = 0; turn < MAX_TURNS && state.phase === 'playing'; turn++) {
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

/**
 * Plays greedily: lay a card whenever possible, draw only as a last resort.
 * This is how a sensible player behaves, and it is the policy under which
 * termination is meaningful — a random policy draws so often that hands grow
 * without bound.
 */
function playOutGreedy(seatCount: number, seed: number, rules?: TableRules): GameState {
  const names = ['a', 'b', 'c', 'd'].slice(0, seatCount)
  const init = rules === undefined ? initGame({ names, seed }) : initGame({ names, seed, rules })
  if (!init.okay) throw new Error(init.error)

  let state = init.value
  for (let turn = 0; turn < MAX_TURNS && state.phase === 'playing'; turn++) {
    const moves = legalMoves(state, state.currentSeat)
    // Call UNO first when it is offered: otherwise the penalty cancels out the
    // progress and the game never converges towards an end.
    const move =
      moves.find((m) => m.type === 'callUno') ??
      moves.find((m) => m.type === 'play') ??
      moves.find((m) => m.type === 'acceptDraw') ??
      moves[0]
    if (move === undefined) break
    const result = applyMove(state, state.currentSeat, move)
    if (!result.okay) throw new Error(`legal move rejected: ${result.error}`)
    state = result.value
  }
  return state
}

const gameArbitraries = [
  fc.integer({ min: 2, max: 4 }),
  fc.integer({ min: 0, max: 100_000 }),
  fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 40 }),
] as const

/**
 * Well above what these need, on purpose. Conservation runs 300 games and checks
 * every intermediate state of each, which measures at ~1.1s alone but was seen at
 * 5.5s while the rest of the suite competed for cores — enough to cross vitest's
 * 5s default and fail a run that had found nothing wrong.
 *
 * The alternative was cutting numRuns, which trades away the coverage that makes
 * a property test worth having. Generous headroom still leaves a genuine hang
 * caught, just later.
 */
const PROPERTY_TIMEOUT_MS = 20_000

describe('card conservation', () => {
  it(
    'holds across randomly played games',
    () => {
      fc.assert(
        fc.property(...gameArbitraries, (seatCount, seed, picks) => {
          for (const state of playOut(seatCount, seed, picks).states) expectConservation(state)
        }),
        { numRuns: 300 },
      )
    },
    PROPERTY_TIMEOUT_MS,
  )
})

describe('state validity', () => {
  it(
    'never lets legalMoves produce a move that applyMove rejects',
    () => {
      fc.assert(
        fc.property(...gameArbitraries, (seatCount, seed, picks) => {
          // playOut throws if a move coming out of legalMoves gets rejected.
          expect(() => playOut(seatCount, seed, picks)).not.toThrow()
        }),
        { numRuns: 300 },
      )
    },
    PROPERTY_TIMEOUT_MS,
  )

  it(
    'keeps currentSeat pointing at an active seat while playing',
    () => {
      fc.assert(
        fc.property(...gameArbitraries, (seatCount, seed, picks) => {
          for (const state of playOut(seatCount, seed, picks).states) {
            if (state.phase !== 'playing') continue
            expect(state.seats[state.currentSeat]?.status).toBe('active')
          }
        }),
        { numRuns: 200 },
      )
    },
    PROPERTY_TIMEOUT_MS,
  )

  it(
    'never leaves a negative or fractional debt',
    () => {
      fc.assert(
        fc.property(...gameArbitraries, (seatCount, seed, picks) => {
          for (const state of playOut(seatCount, seed, picks).states) {
            if (state.pendingDraw === null) continue
            expect(state.pendingDraw.amount).toBeGreaterThan(0)
            expect(Number.isInteger(state.pendingDraw.amount)).toBe(true)
          }
        }),
        { numRuns: 200 },
      )
    },
    PROPERTY_TIMEOUT_MS,
  )

  it(
    'declares a winner with an empty hand whenever a game finishes',
    () => {
      fc.assert(
        fc.property(...gameArbitraries, (seatCount, seed, picks) => {
          const { final } = playOut(seatCount, seed, picks)
          if (final.phase !== 'finished') return
          expect(final.winner).not.toBeNull()
          expect(final.seats[final.winner ?? -1]?.hand).toHaveLength(0)
        }),
        { numRuns: 200 },
      )
    },
    PROPERTY_TIMEOUT_MS,
  )

  it(
    'terminates under greedy play, for every seat count and seed',
    () => {
      for (const seatCount of [2, 3, 4]) {
        for (let seed = 0; seed < 40; seed++) {
          const final = playOutGreedy(seatCount, seed)
          expect(final.phase, `seatCount=${seatCount} seed=${seed}`).toBe('finished')
          expect(final.seats[final.winner ?? -1]?.hand).toHaveLength(0)
        }
      }
    },
    PROPERTY_TIMEOUT_MS,
  )

  it(
    'is fully reproducible from seed and picks',
    () => {
      const a = playOut(4, 31337, [0, 2, 1, 4]).final
      const b = playOut(4, 31337, [0, 2, 1, 4]).final
      expect(a).toEqual(b)
    },
    PROPERTY_TIMEOUT_MS,
  )
})

/**
 * A Liar table where nobody ever calls UNO and everybody is watching: before each
 * turn, every seat that can call somebody out does.
 *
 * The policy is deliberately not the sensible one. A seat that calls UNO never
 * becomes vulnerable, so a greedy player exercises none of this — the interesting
 * games are the ones full of forgotten UNOs.
 */
function playOutWatchful(
  seatCount: number,
  seed: number,
  picks: readonly number[],
): { states: GameState[]; callOuts: number } {
  const init = initGame({
    names: ['a', 'b', 'c', 'd'].slice(0, seatCount),
    seed,
    rules: { liar: true, sevenZero: false, jumpIn: false },
  })
  if (!init.okay) throw new Error(init.error)

  let state = init.value
  const states: GameState[] = [state]
  let callOuts = 0

  for (let turn = 0; turn < MAX_TURNS && state.phase === 'playing'; turn++) {
    for (const watcher of state.seats) {
      const callOut = legalMoves(state, watcher.index).find((m) => m.type === 'callOut')
      if (callOut === undefined) continue
      const called = applyMove(state, watcher.index, callOut)
      if (!called.okay) throw new Error(`legal call-out rejected: ${called.error}`)
      state = called.value
      states.push(state)
      callOuts += 1
    }

    const moves = legalMoves(state, state.currentSeat)
    const playable = moves.filter((m) => m.type === 'play')
    const pick = picks[turn % picks.length] ?? 0
    const move =
      playable.length > 0
        ? playable[pick % playable.length]
        : (moves.find((m) => m.type === 'acceptDraw') ?? moves.find((m) => m.type === 'draw'))
    if (move === undefined) break
    const result = applyMove(state, state.currentSeat, move)
    if (!result.okay) throw new Error(`legal move rejected: ${result.error}`)
    state = result.value
    states.push(state)
  }

  return { states, callOuts }
}

describe('the Liar call-out keeps every invariant', () => {
  it(
    'conserves the deck, including through a penalty nobody was on turn for',
    () => {
      fc.assert(
        fc.property(...gameArbitraries, (seatCount, seed, picks) => {
          for (const state of playOutWatchful(seatCount, seed, picks).states) {
            expectConservation(state)
          }
        }),
        { numRuns: 200 },
      )
    },
    PROPERTY_TIMEOUT_MS,
  )

  it(
    'never offers a call-out that applyMove then rejects',
    () => {
      fc.assert(
        fc.property(...gameArbitraries, (seatCount, seed, picks) => {
          // playOutWatchful throws if anything legalMoves offered is refused.
          expect(() => playOutWatchful(seatCount, seed, picks)).not.toThrow()
        }),
        { numRuns: 200 },
      )
    },
    PROPERTY_TIMEOUT_MS,
  )

  it(
    'keeps currentSeat on an active seat, which a call-out must never move',
    () => {
      fc.assert(
        fc.property(...gameArbitraries, (seatCount, seed, picks) => {
          for (const state of playOutWatchful(seatCount, seed, picks).states) {
            if (state.phase !== 'playing') continue
            expect(state.seats[state.currentSeat]?.status).toBe('active')
          }
        }),
        { numRuns: 200 },
      )
    },
    PROPERTY_TIMEOUT_MS,
  )

  it('actually calls somebody out, or the three properties above prove nothing', () => {
    const total = [0, 1, 2, 3, 4]
      .map((seed) => playOutWatchful(3, seed, [0, 1, 2]).callOuts)
      .reduce((sum, count) => sum + count, 0)
    expect(total).toBeGreaterThan(0)
  })

  it(
    'still terminates under greedy play with the option on',
    () => {
      for (const seatCount of [2, 3, 4]) {
        for (let seed = 0; seed < 40; seed++) {
          const final = playOutGreedy(seatCount, seed, {
            liar: true,
            sevenZero: false,
            jumpIn: false,
          })
          expect(final.phase, `seatCount=${seatCount} seed=${seed}`).toBe('finished')
          expect(final.seats[final.winner ?? -1]?.hand).toHaveLength(0)
        }
      }
    },
    PROPERTY_TIMEOUT_MS,
  )
})

/**
 * A Seven-Zero table, played so the option actually fires.
 *
 * The policy leans towards swap moves rather than picking uniformly, because that
 * is what makes these properties mean anything: a 7 has to be both held and
 * playable, so a neutral policy permutes hands rarely enough that a broken swap
 * could slip through hundreds of runs untouched. Nobody ever calls UNO, and anyone
 * who may call somebody out does — a swap can open a window on a seat whose turn it
 * is not, which is the interesting collision between the two options.
 */
function playOutSevenZero(
  seatCount: number,
  seed: number,
  picks: readonly number[],
  rules: TableRules,
): { states: GameState[]; swaps: number; rotations: number } {
  const init = initGame({ names: ['a', 'b', 'c', 'd'].slice(0, seatCount), seed, rules })
  if (!init.okay) throw new Error(init.error)

  let state = init.value
  const states: GameState[] = [state]
  let swaps = 0
  let rotations = 0

  const isRotation = (move: Move): boolean => {
    if (move.type !== 'play') return false
    const card = state.seats[state.currentSeat]?.hand.find((c) => c.id === move.cardId)
    return card?.kind === 'number' && card.value === 0 && activeCount(state) > 1
  }

  for (let turn = 0; turn < MAX_TURNS && state.phase === 'playing'; turn++) {
    for (const watcher of state.seats) {
      const callOut = legalMoves(state, watcher.index).find((m) => m.type === 'callOut')
      if (callOut === undefined) continue
      const called = applyMove(state, watcher.index, callOut)
      if (!called.okay) throw new Error(`legal call-out rejected: ${called.error}`)
      state = called.value
      states.push(state)
    }

    const moves = legalMoves(state, state.currentSeat)
    const swapping = moves.filter((m) => m.type === 'play' && m.swapWith !== undefined)
    const playable = moves.filter((m) => m.type === 'play')
    const pick = picks[turn % picks.length] ?? 0

    // Alternating rather than always swapping, so ordinary play is still exercised
    // and a 0 still gets laid down now and then.
    const preferred = pick % 2 === 0 && swapping.length > 0 ? swapping : playable
    const move =
      preferred.length > 0
        ? preferred[pick % preferred.length]
        : (moves.find((m) => m.type === 'acceptDraw') ?? moves.find((m) => m.type === 'draw'))
    if (move === undefined) break

    if (move.type === 'play' && move.swapWith !== undefined) swaps += 1
    else if (isRotation(move)) rotations += 1

    const result = applyMove(state, state.currentSeat, move)
    if (!result.okay) throw new Error(`legal move rejected: ${result.error}`)
    state = result.value
    states.push(state)
  }

  return { states, swaps, rotations }
}

/* Both combinations, because they interact: a swap can leave a seat holding one
   card, which only means something on a table that also opted into `liar`. */
const SEVEN_ZERO_TABLES: TableRules[] = [
  { liar: false, sevenZero: true, jumpIn: false },
  { liar: true, sevenZero: true, jumpIn: false },
]

describe('Seven-Zero keeps every invariant', () => {
  it(
    'conserves the deck across hands being permuted, which is the risk here',
    () => {
      for (const rules of SEVEN_ZERO_TABLES) {
        fc.assert(
          fc.property(...gameArbitraries, (seatCount, seed, picks) => {
            for (const state of playOutSevenZero(seatCount, seed, picks, rules).states) {
              expectConservation(state)
            }
          }),
          { numRuns: 200 },
        )
      }
    },
    PROPERTY_TIMEOUT_MS,
  )

  it(
    'never offers a swap that applyMove then rejects',
    () => {
      for (const rules of SEVEN_ZERO_TABLES) {
        fc.assert(
          fc.property(...gameArbitraries, (seatCount, seed, picks) => {
            // playOutSevenZero throws if anything legalMoves offered is refused,
            // which is where a mismatch between the offer and the gate would show.
            expect(() => playOutSevenZero(seatCount, seed, picks, rules)).not.toThrow()
          }),
          { numRuns: 200 },
        )
      }
    },
    PROPERTY_TIMEOUT_MS,
  )

  it(
    'keeps currentSeat on an active seat, which moving hands must not disturb',
    () => {
      for (const rules of SEVEN_ZERO_TABLES) {
        fc.assert(
          fc.property(...gameArbitraries, (seatCount, seed, picks) => {
            for (const state of playOutSevenZero(seatCount, seed, picks, rules).states) {
              if (state.phase !== 'playing') continue
              expect(state.seats[state.currentSeat]?.status).toBe('active')
            }
          }),
          { numRuns: 200 },
        )
      }
    },
    PROPERTY_TIMEOUT_MS,
  )

  it('never hands somebody a card that came from nowhere', () => {
    /* Conservation counts the deck; this counts each seat. A permutation must move
       hands around without changing how many cards are in play, and the only thing
       that may add to the total is a genuine draw. */
    for (const rules of SEVEN_ZERO_TABLES) {
      for (let seed = 0; seed < 20; seed += 1) {
        const { states } = playOutSevenZero(3, seed, [0, 1, 2, 3], rules)
        for (const state of states) {
          const held = state.seats.flatMap((s) => s.hand)
          expect(new Set(held.map((c) => c.id)).size).toBe(held.length)
        }
      }
    }
  })

  it('actually swaps and actually rotates, or the properties above prove nothing', () => {
    const totals = [0, 1, 2, 3, 4]
      .map((seed) =>
        playOutSevenZero(3, seed, [0, 1, 2, 3], { liar: true, sevenZero: true, jumpIn: false }),
      )
      .reduce(
        (sum, game) => ({
          swaps: sum.swaps + game.swaps,
          rotations: sum.rotations + game.rotations,
        }),
        { swaps: 0, rotations: 0 },
      )
    expect(totals.swaps).toBeGreaterThan(0)
    expect(totals.rotations).toBeGreaterThan(0)
  })

  it(
    'still terminates under greedy play with the option on',
    () => {
      for (const rules of SEVEN_ZERO_TABLES) {
        for (const seatCount of [2, 3, 4]) {
          for (let seed = 0; seed < 40; seed++) {
            const final = playOutGreedy(seatCount, seed, rules)
            expect(final.phase, `seatCount=${seatCount} seed=${seed}`).toBe('finished')
            expect(final.seats[final.winner ?? -1]?.hand).toHaveLength(0)
          }
        }
      }
    },
    PROPERTY_TIMEOUT_MS,
  )
})

/**
 * A jump-in table, played by seats that jump the moment they are able to.
 *
 * The one harness here that acts for a seat which is NOT `currentSeat` and expects
 * the turn to move: every other move in the game answers to whose turn it is, and a
 * jump-in both ignores that and rewrites it. So the loop asks every off-turn seat
 * what it may do, takes the jump-in, and then carries on with whoever holds the turn
 * afterwards — which is deliberately not who held it a moment ago.
 *
 * `picks` steers whether an available jump-in is actually taken, so ordinary play is
 * still exercised: a table where every jump-in is always taken is not the only table
 * worth being sure about.
 */
function playOutJumpIn(
  seatCount: number,
  seed: number,
  picks: readonly number[],
  rules: TableRules,
): { states: GameState[]; jumps: number } {
  const init = initGame({ names: ['a', 'b', 'c', 'd'].slice(0, seatCount), seed, rules })
  if (!init.okay) throw new Error(init.error)

  let state = init.value
  const states: GameState[] = [state]
  let jumps = 0

  for (let turn = 0; turn < MAX_TURNS && state.phase === 'playing'; turn++) {
    const pick = picks[turn % picks.length] ?? 0

    // Everybody who can call somebody out does, exactly as on a Liar table.
    for (const watcher of state.seats) {
      const callOut = legalMoves(state, watcher.index).find((m) => m.type === 'callOut')
      if (callOut === undefined) continue
      const called = applyMove(state, watcher.index, callOut)
      if (!called.okay) throw new Error(`legal call-out rejected: ${called.error}`)
      state = called.value
      states.push(state)
    }

    /* At most one seat can hold a jump-in against a given top — the twin of a card
       is in one place only — but the loop does not assume that, and takes the first
       one it finds. */
    if (pick % 3 !== 0) {
      for (const jumper of state.seats) {
        if (jumper.index === state.currentSeat) continue
        const jump = legalMoves(state, jumper.index).find((m) => m.type === 'play')
        if (jump === undefined) continue
        const jumped = applyMove(state, jumper.index, jump)
        if (!jumped.okay) throw new Error(`legal jump-in rejected: ${jumped.error}`)
        state = jumped.value
        states.push(state)
        jumps += 1
        break
      }
      if (state.phase !== 'playing') break
    }

    const moves = legalMoves(state, state.currentSeat)
    const playable = moves.filter((m) => m.type === 'play')
    const move =
      playable.length > 0
        ? playable[pick % playable.length]
        : (moves.find((m) => m.type === 'acceptDraw') ?? moves.find((m) => m.type === 'draw'))
    if (move === undefined) break
    const result = applyMove(state, state.currentSeat, move)
    if (!result.okay) throw new Error(`legal move rejected: ${result.error}`)
    state = result.value
    states.push(state)
  }

  return { states, jumps }
}

/**
 * Greedy, and jumping in unconditionally whenever a jump-in is offered.
 *
 * The policy termination is measured under, and deliberately the unfavourable one:
 * jumping down to one card cannot be declared — an off-turn seat is offered no
 * `callUno` — so on a table without `liar` every such jump costs the jumper the two
 * cards it just saved. A player who always jumps is therefore a player who sometimes
 * makes their own hand bigger, which is exactly the shape a non-terminating game
 * would need.
 */
function playOutGreedyJumping(seatCount: number, seed: number, rules: TableRules): GameState {
  const init = initGame({ names: ['a', 'b', 'c', 'd'].slice(0, seatCount), seed, rules })
  if (!init.okay) throw new Error(init.error)

  let state = init.value
  for (let turn = 0; turn < MAX_TURNS && state.phase === 'playing'; turn++) {
    let jumped = false
    for (const jumper of state.seats) {
      if (jumper.index === state.currentSeat) continue
      const jump = legalMoves(state, jumper.index).find((m) => m.type === 'play')
      if (jump === undefined) continue
      const applied = applyMove(state, jumper.index, jump)
      if (!applied.okay) throw new Error(`legal jump-in rejected: ${applied.error}`)
      state = applied.value
      jumped = true
      break
    }
    if (jumped) continue

    const moves = legalMoves(state, state.currentSeat)
    const move =
      moves.find((m) => m.type === 'callUno') ??
      moves.find((m) => m.type === 'play') ??
      moves.find((m) => m.type === 'acceptDraw') ??
      moves[0]
    if (move === undefined) break
    const result = applyMove(state, state.currentSeat, move)
    if (!result.okay) throw new Error(`legal move rejected: ${result.error}`)
    state = result.value
  }
  return state
}

/* Every combination that can interact with a jump-in: alone, with the Liar window a
   jumper landing on one card opens, and with the Seven-Zero effect a jumped 7 or 0
   carries into the jumper's seat. */
const JUMP_IN_TABLES: TableRules[] = [
  { liar: false, sevenZero: false, jumpIn: true },
  { liar: true, sevenZero: false, jumpIn: true },
  { liar: true, sevenZero: true, jumpIn: true },
]

describe('jump-in keeps every invariant', () => {
  it(
    'conserves the deck across cards played by seats whose turn it was not',
    () => {
      for (const rules of JUMP_IN_TABLES) {
        fc.assert(
          fc.property(...gameArbitraries, (seatCount, seed, picks) => {
            for (const state of playOutJumpIn(seatCount, seed, picks, rules).states) {
              expectConservation(state)
            }
          }),
          { numRuns: 200 },
        )
      }
    },
    PROPERTY_TIMEOUT_MS,
  )

  it(
    'never offers a jump-in that applyMove then rejects',
    () => {
      for (const rules of JUMP_IN_TABLES) {
        fc.assert(
          fc.property(...gameArbitraries, (seatCount, seed, picks) => {
            /* playOutJumpIn throws if anything legalMoves offered is refused, which
               is where the off-turn exemption and the offer would show up out of
               step: the gate reads the state as it is, the exemption has to agree. */
            expect(() => playOutJumpIn(seatCount, seed, picks, rules)).not.toThrow()
          }),
          { numRuns: 200 },
        )
      }
    },
    PROPERTY_TIMEOUT_MS,
  )

  it(
    'keeps currentSeat on an active seat, which a jump-in moves on purpose',
    () => {
      for (const rules of JUMP_IN_TABLES) {
        fc.assert(
          fc.property(...gameArbitraries, (seatCount, seed, picks) => {
            for (const state of playOutJumpIn(seatCount, seed, picks, rules).states) {
              if (state.phase !== 'playing') continue
              expect(state.seats[state.currentSeat]?.status).toBe('active')
            }
          }),
          { numRuns: 200 },
        )
      }
    },
    PROPERTY_TIMEOUT_MS,
  )

  it(
    'never offers a jump-in while a draw is pending, in any state of any game',
    () => {
      /* The rule with no other guard than this one: a unit test can only show it for
         the states it builds, and whether a stacked draw ever coincides with somebody
         holding the twin of the card that stacked it is a question about the deal. Over
         hundreds of games it happens, and the property is what makes the answer
         trustworthy rather than lucky. */
      for (const rules of JUMP_IN_TABLES) {
        fc.assert(
          fc.property(...gameArbitraries, (seatCount, seed, picks) => {
            for (const state of playOutJumpIn(seatCount, seed, picks, rules).states) {
              if (state.phase !== 'playing' || state.pendingDraw === null) continue
              for (const seat of state.seats) {
                if (seat.index === state.currentSeat) continue
                expect(legalMoves(state, seat.index).filter((m) => m.type === 'play')).toEqual([])
              }
            }
          }),
          { numRuns: 200 },
        )
      }
    },
    PROPERTY_TIMEOUT_MS,
  )

  it('never lets the same card be held twice, or held by two seats at once', () => {
    /* Conservation counts the deck; this counts the hands. A jump-in takes a card
       out of a hand nobody was expecting to change, so the failure to watch for is a
       card that leaves a hand and stays in it. */
    for (const rules of JUMP_IN_TABLES) {
      for (let seed = 0; seed < 20; seed += 1) {
        const { states } = playOutJumpIn(3, seed, [0, 1, 2, 3], rules)
        for (const state of states) {
          const held = state.seats.flatMap((s) => s.hand)
          expect(new Set(held.map((c) => c.id)).size).toBe(held.length)
        }
      }
    }
  })

  it('actually jumps in, or the properties above prove nothing', () => {
    const total = [0, 1, 2, 3, 4]
      .map((seed) => playOutJumpIn(3, seed, [0, 1, 2, 3], JUMP_IN_TABLES[0] ?? DEFAULT_TABLE_RULES))
      .reduce((sum, game) => sum + game.jumps, 0)
    expect(total).toBeGreaterThan(0)
  })

  it(
    'still terminates when every jump-in on offer is taken',
    () => {
      /* The invariant most at risk, and the reason this option was worth being ready
         to abandon: a jump-in moves the turn without the previous seat having played,
         so a cycle in which play never progresses is a real shape. It cannot arise —
         every jump-in spends a card, and the twin of a card is in one place only, so
         no jump-in can be answered by another jump-in on the same card. */
      for (const rules of JUMP_IN_TABLES) {
        for (const seatCount of [2, 3, 4]) {
          for (let seed = 0; seed < 40; seed++) {
            const final = playOutGreedyJumping(seatCount, seed, rules)
            expect(final.phase, `seatCount=${seatCount} seed=${seed}`).toBe('finished')
            expect(final.seats[final.winner ?? -1]?.hand).toHaveLength(0)
          }
        }
      }
    },
    PROPERTY_TIMEOUT_MS,
  )

  it(
    'still terminates under ordinary greedy play with the option merely on',
    () => {
      for (const rules of JUMP_IN_TABLES) {
        for (const seatCount of [2, 3, 4]) {
          for (let seed = 0; seed < 40; seed++) {
            const final = playOutGreedy(seatCount, seed, rules)
            expect(final.phase, `seatCount=${seatCount} seed=${seed}`).toBe('finished')
            expect(final.seats[final.winner ?? -1]?.hand).toHaveLength(0)
          }
        }
      }
    },
    PROPERTY_TIMEOUT_MS,
  )
})
