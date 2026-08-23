# The table says what is true

Two defects with one cause: during a game, nothing on screen tells you what rules you
are playing by, or that a call-out window has opened.

## Why this exists

It is the only defect a real player hit. Mid-game the report was *"the guy didn't say
UNO, I have no call-out button, and he didn't draw two cards"* - three observations, none
of them a bug. The table had the `liar` rule on, so the penalty was manual rather than
automatic; the button existed; it sits on the offending seat and had been missed for
entire games.

Nothing was broken. The table simply never said what was going on, so a correct game
read as a broken one.

The lobby was fixed for this two days ago - everybody sees the rules before the deal.
That closed the half of the problem I had identified and left the half that matters
more, because a rule you read once before a game is not a rule you remember during it.

## Half of this needs no new data

Worth stating before designing anything: the call-out signal is already derivable
client-side.

- The player who **may accuse** has `{ type: 'callOut', target }` in `legalMoves` - that
  is what already renders the button.
- The player who **is exposed** has `callUno` in theirs, and calling it on their own next
  turn is how they escape.

So the window can be signalled with no protocol change at all. Only the rules need the
wire.

## The wire

`PlayerView` gains `rules: TableRules`, beside the `match` progress it already carries.

`views.ts` currently documents rules as deliberately absent from the player view; that
comment was written when only the lobby needed them and must be rewritten rather than
deleted, because the engine/protocol split it explains is still true.

On payload: four booleans against a view sent once per member per move. Measured at
about 1.4 KB per view, this adds well under 1%, and permessage-deflate compresses a
field that never changes between frames to almost nothing. Sending it once in the lobby
and remembering it client-side would be smaller and wrong - a player who reloads
mid-game receives a `PlayerView`, not a lobby, and would show a table with no rules.

## What the table shows, and what it does not

Not all four. A badge listing every rule every game is noise, and noise is what gets
ignored - which is the defect this is meant to fix.

| Rule | Shown? |
| --- | --- |
| `liar`, `sevenZero`, `jumpIn` | When on. These are house rules; a table playing them is unusual and that is the fact worth carrying. |
| `playDrawnCard` | Never. It is the official rule and on by default, so its presence says nothing. **When off**, it is shown - because a table where a drawn card cannot be played is the unusual one. |
| Blazing (`pace`) | Already visible as a running clock. Not repeated. |

So the badge answers "what is unusual about this table", and an ordinary table shows
nothing at all. A table with nothing unusual needs no explaining.

## The call-out window

Two audiences, opposite needs.

**Whoever can accuse** already gets the button. What is missing is that the *seat* does
not look different, so the button reads as decoration rather than as an opportunity that
expires. Mark the seat itself - the same seat the button sits under - so the eye is drawn
to the person, not to a control.

**Whoever is exposed** is told nothing at all today. They should be, because escaping is
possible and the rules allow it: call UNO on your own next turn before playing. Telling
them is not helping them cheat, it is the rule.

The window closes when the exposed seat's next turn ends, which is already enforced in
the engine. The signal must disappear with it, and must not be animated in a way that
survives the state that raised it - this project has already shipped one overlay that
reverted to `opacity: 1` for ever because an animation had no fill mode.

## Testing

- The rule reaches the client: a socket test reading `rules` off a real `PlayerView`,
  and a rejoin mid-game receiving them too - that second case is the reason this is on
  the player view at all.
- The badge shows a house rule that is on, hides one that is off, never shows
  `playDrawnCard` when on, and does show it when off.
- An ordinary table renders no badge rather than an empty one.
- The vulnerable seat is marked for the accuser and for the exposed player, and the mark
  goes when the window closes.
- Both catalogues carry every new key, and the source guard stays green.
- Mutations: drop `rules` from the view; show all four unconditionally; leave the mark on
  after the window closes.
