# Playing the card you just drew

An option, **on by default**, letting a player lay down the card they drew when it
happens to be playable.

## Why this one defaults on, unlike the three variants

It is not a variant. It is the official rule: *if the card drawn can be played, the
player is free to lay down that card.* The current behaviour - a voluntary draw
always ends the turn - was a deliberate simplification, recorded in the README as
removing "a whole class of UI and protocol complexity". It did, and it also made
the game slightly wrong.

So this reverses a documented decision rather than adding a house rule, and
defaulting it on is what makes the table play official UNO. `DEFAULT_TABLE_RULES`
gains its first `true`; say so in a comment beside it, or somebody will assume the
`false`s are a pattern.

Keeping the flag at all, rather than simply changing the rule, is for the group who
learned it the other way - and because the sub-state below is worth being able to
switch off if it proves annoying in practice.

```ts
// packages/engine/src/types.ts, on TableRules
/** The official rule. On by default; see the spec for why this one differs. */
playDrawnCard: boolean
```

## The sub-state, and how to keep it small

After a **voluntary** draw the turn does not end. The seat may either play the card
it just drew, or pass.

```ts
// on GameState
/** The card just drawn, still playable by the seat on turn. Null the rest of the time. */
drawnCard: CardId | null
```

The rules that keep this from spreading:

| Point | Decision |
| --- | --- |
| Only the drawn card | `legalMoves` offers `play` for **that card alone**, plus `pass`. Not the rest of the hand - that would be a different game, where drawing is a free extra turn. |
| Only when it is playable | If the drawn card cannot be played, the turn ends immediately as it does today. No sub-state, no extra click, nothing to dismiss. A choice only appears when there is one. |
| Only a voluntary draw | `acceptDraw` - taking a stacked +2 or +4 - grants nothing. That is a penalty, not a draw, and the official rules do not let you play out of it. |
| Passing is a move | `{ type: 'pass' }`. Drawing no longer ends the turn, so something has to, and it must be explicit rather than inferred from a timeout. |
| A wild drawn | Playable, and needs its colour like any other wild. `legalMoves` enumerates one `play` per colour, exactly as it already does. |
| Clearing it | On `pass`, on playing it, and on any turn change from any cause - a timeout, a disconnection, a round ending. A stale `drawnCard` would let a seat play a card it no longer holds. |

## Interactions to get right

**Blazing.** If the clock expires in the sub-state, the forced move is `pass`, not
another draw - they have already drawn, and forcing a second would punish the clock
twice. `forceTurnMove` currently prefers `acceptDraw` then `draw`; `pass` goes first
when `drawnCard` is set.

**Jump-in.** No jump-in while a seat is in the sub-state. The turn is still theirs
and unresolved, the same reasoning that forbids jumping a pending draw.

**The Liar window.** Playing the drawn card can take a seat to one card, so the
window opens exactly as it does for any other play. Passing cannot change a hand
size, so it cannot open one.

**UNO.** `callUno` stays legal in the sub-state: the seat is still on turn and has
not yet played. Drawing to two cards and then playing to one is a normal way to
reach one card.

## Client

The drawn card is offered as playable and everything else is not - which the client
already renders correctly, because it only ever offers what `legalMoves` contains.
What is new is the **pass** control, and it must be obvious: a player who drew an
unplayable-looking card and sees no way forward will think the game has hung.

Label it for what it does - ending the turn - rather than "pass", which in a card
game can read as declining to draw. Copy goes in both catalogues.

Under Blazing the countdown keeps running in the sub-state, which is correct and
worth checking: the clock must not reset because a draw happened.

## Testing

- Unit: the drawn card is playable and the rest of the hand is not; an unplayable
  draw ends the turn with no sub-state; `acceptDraw` grants nothing; `pass` ends the
  turn; a drawn wild offers its colours; the sub-state clears on every turn change.
- Property tests: extend the harness with the option on **and** off. The invariants
  that matter are the usual ones - card conservation, termination, `currentSeat`
  always active, every offered move accepted. Termination deserves attention: a
  sub-state that could be re-entered without spending a card would hang the game.
  Assert non-vacuity, that generated games really do enter the sub-state.
- Over a socket: draw, then play the drawn card, over a real connection.
- Blazing: the clock expiring in the sub-state passes rather than draws again.
