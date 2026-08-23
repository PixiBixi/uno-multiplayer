# The Liar call-out, and two table variants

Three rule changes, in the order they should be built. Every decision below is
settled - an implementer should not need to invent one. Where a choice was close,
the rejected alternative is named so nobody relitigates it by accident.

All three are **opt-in table options**, chosen by the host at creation, alongside
`MatchGoal` and `MatchPace`. Default off. A group that wants plain UNO gets plain
UNO.

```ts
// packages/protocol/src/views.ts, beside MatchPace
type TableRules = {
  /** Forgetting UNO costs nothing unless somebody calls it out. */
  liar: boolean
  /** A 7 swaps hands with a chosen player; a 0 rotates every hand. */
  sevenZero: boolean
  /** An identical card may be played out of turn. */
  jumpIn: boolean
}
```

Bounds are trivial here, but the field still goes through Zod at the socket
boundary like every other payload: a client can send whatever it likes.

---

## 1. The Liar call-out

**What changes.** Today, going down to one card without calling UNO costs two cards
automatically (`UNO_PENALTY` in the reducer). With `liar` on, it costs nothing
unless another player calls it out first.

**Why it is worth having.** The automatic penalty removes the part of UNO people
actually enjoy - watching each other. Making it manual restores it.

### The window

A seat becomes **vulnerable** the moment it drops to one card without having called
UNO, and stops being vulnerable when any of these happens:

- it calls UNO (still legal on its own next turn, before playing)
- somebody calls it out
- its next turn ends

The last one is the important bound: the window is *until the end of their next
turn*, not "forever". Without a bound, a player could be accused ten minutes later,
which is not a game, it is a trap.

Represent it as a field on the seat, not as a timer:

```ts
// packages/engine/src/types.ts, on Seat
/** Set when this seat reached one card uncalled; cleared per the rules above. */
vulnerable: boolean
```

A field rather than a timer because `Room` is deliberately timer-free and the
engine has no clock. The window is measured in turns, which the engine already
counts.

### The move

```ts
{ type: 'callOut'; target: number }
```

Legal for any **active** seat that is not the target, whenever the target is
vulnerable - **including when it is not the caller's turn**. That is the only move
in the game that is legal off-turn, and it is deliberate: an accusation you can only
make on your own turn is useless.

`legalMoves` currently returns `[]` for any seat that is not `currentSeat`. That
early return has to become conditional: off-turn seats get call-out moves and
nothing else. Read the existing comment there before changing it.

Outcomes:

- **Correct call-out** - the target draws two (reuse `UNO_PENALTY`). Emit
  `unoPenalty` for the target so the existing statistics and sound keep working,
  plus a new `calledOut { by, target }` for the log.
- **A wrong call-out cannot happen**, because the move is only legal while the
  target is actually vulnerable. Rejected alternative: allowing a wrong accusation
  and penalising the accuser. It sounds fun and is miserable in practice - it
  punishes paying attention badly rather than rewarding paying attention well.

### The turn is not affected

A call-out never changes whose turn it is and never ends a round. It is a side
effect on one hand. That keeps it out of the turn-advance logic entirely, which is
where the risk would otherwise be.

### Client

A **Liar!** button appears beside any opponent who is vulnerable, only when the
server offers the move - the client evaluates nothing. UI copy goes in both
catalogues under `table`; the French label is `Menteur !`.

---

## 2. Seven-Zero

**What changes.** With `sevenZero` on, two number cards gain an effect when played:

- a **7** lets the player swap hands with a player of their choice
- a **0** rotates every hand one seat in the current direction of play

**Why the 7 needs a new interaction.** Choosing whom to swap with is a second
decision after playing the card, exactly like choosing a colour after a wild. Reuse
that shape rather than inventing one:

```ts
{ type: 'play'; cardId: CardId; chosenColor?: Color; swapWith?: number }
```

`legalMoves` emits one move per legal target, the same way it already emits one
`play` per colour for a wild. That keeps the client free of rules: it renders a
target picker from the moves it was given.

### Decisions

| Point | Decision |
| --- | --- |
| Who can be swapped with | Any other **active** seat. Not a seat that has left - its hand is empty and swapping into it would hand somebody a free win. |
| Two players | A 7 has exactly one legal target, so it always swaps. It is not made a no-op: that would silently change the card's value. |
| A 0 with two players | Rotating two hands is a swap. Correct, and worth a test so nobody "fixes" it. |
| Direction | The 0 rotation follows `direction`, so a reverse before it changes where hands go. |
| UNO and vulnerability | Swapping can put a seat on one card. It becomes vulnerable exactly as if it had played down to one, since the rule is about holding one card uncalled. |
| Card conservation | Unchanged - hands are permuted, nothing is created. The existing property test must still pass, and is the main safety net here. |

Events: `handsSwapped { seat, with }` and `handsRotated { direction }`.

---

## 3. Jump-in

**The risky one. Build it last, and only once the other two are solid.**

**What changes.** With `jumpIn` on, any player holding a card **identical** to the
discard top - same colour *and* same value or kind - may play it immediately, out
of turn. Play then continues from them.

**Why it is risky.** It inverts the assumption the whole engine rests on: that only
`currentSeat` can act. Every other move validates against `currentSeat`. This one
cannot, and it also *moves* `currentSeat` to the jumper, which means turn advance,
the pending-draw state, and the UNO window all interact with it.

### Decisions

| Point | Decision |
| --- | --- |
| What counts as identical | Same colour **and** same value for numbers, same colour and same kind for action cards. Wilds can never be jumped in: they have no colour, so every wild would match every wild, which is not the rule and is chaos. |
| Whose turn after | The jumper's. `currentSeat` becomes the jumper and play continues in the current direction from there. Seats between the previous player and the jumper simply lose their turn - that is the point of the rule. |
| While a draw is pending | **Not allowed.** A stacked +2/+4 has its own strict answer rules; letting a jump-in interleave would make "strictly same type" meaningless. Return the pending-draw moves only. |
| The jumper's own turn | A jump-in *is* their turn. The card's own effect (skip, reverse, draw) then applies from their seat as normal. |
| Races | Two players may jump the same card. The server is the only authority and applies whichever arrives first; the second gets `illegal_move`, which the client already reports. Do not attempt to resolve this on the client. |
| UNO | A jumper reaching one card becomes vulnerable like anyone else. |

`legalMoves` for an off-turn seat therefore returns call-out moves plus jump-in
moves, and nothing else.

### Test this one harder than the others

The property tests are the safety net. Extend the existing arbitraries so generated
games sometimes jump in, then assert what already holds for ordinary play:

- card conservation across every intermediate state
- termination - a jump-in must not create a cycle where play never progresses
- `currentSeat` always points at an active seat
- every move `legalMoves` offers is accepted by `applyMove`

If any of those cannot be made to hold, **stop and report** rather than weakening
the test. A variant that breaks an invariant is not worth having.

---

## Order, and what "done" means for each

1. Liar - smallest, and the only one with no effect on turn order.
2. Seven-Zero - reuses the wild-colour interaction shape.
3. Jump-in - last, and abandon it rather than weaken an invariant.

Each is done when: the engine change has unit tests **and** the property tests
still pass; the option is validated at the socket boundary; the action is driven
through a real socket in a test, not only through the `Room` API; both catalogues
carry the copy; and `npm run verify` plus `npm run e2e` are green.
