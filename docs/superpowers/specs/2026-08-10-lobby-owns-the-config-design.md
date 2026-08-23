# The lobby owns the configuration

Move every host-only setting off the home screen and into the lobby, where the host
adjusts it while waiting for players - and where everyone who is about to play can
see it.

## The defect this fixes

Measured on production v1.1.0: the home screen carries **21 controls**, is **2.42×**
a phone screen tall, and puts the game-code field last. On three players, two are
joining; their job is two fields, and it sits below everything that is not theirs.

That is the ergonomic half. The functional half is worse:

- `packages/protocol/src/views.ts:44` deliberately keeps `TableRules` out of the
  wire types, and `sevenZero` appears client-side **only** in `Home.tsx`. A guest
  never learns which rules are in play. They find out about Seven-Zero when their
  hand changes owner.
- `LobbyView` already carries `goal` and `pace`, and `Lobby.tsx` renders **neither**.
  Data already on the wire is being thrown away.

So part of this is protocol work and part is just displaying what already arrives.

## What moves where

Confirmed with the user, and it settles a tension between two of their earlier
instructions - *"we can't see the card theme or the language at a glance"* and, of the
points table, *"don't hide it behind a click, there's room everywhere"*.

**Home keeps** - name, game code, Join, Create, card theme, language. Nine controls.
Theme and language are per-player preferences, not table configuration, and they stay
visible without a click.

**The lobby gains** - the match goal, the pace (Blazing), the four table rules, and
the points table, rendered in full rather than behind a disclosure.

## The wire

`LobbyView` gains `rules: TableRules`. It sits beside `goal` and `pace`, which means
the comment at `views.ts:44` - explaining why rules are *absent* - is now wrong and
must be rewritten rather than deleted: the reason rules live in the engine while pace
lives in the protocol is still true and still worth stating.

One new client-to-server event:

```ts
'room:configure': (
  payload: { goal?: MatchGoal; pace?: MatchPace; rules?: TableRules },
  ack: Ack,
) => void
```

Partial on purpose: toggling one rule should not require the client to echo back the
whole configuration and risk clobbering something it read a moment ago. Fields absent
from the payload are left as they are.

Validation is the same Zod schema and the same bounds `room:create` already enforces
(`MIN_POINTS_TARGET`, `MAX_ROUNDS`, `MIN_TURN_SECONDS`, …). Reuse them; a second copy
of the bounds would drift.

`room:create` keeps accepting its configuration. The home screen will now always send
the defaults, but the payload stays: it is already tested, already validated, and
removing it would break a client mid-deploy for no gain.

## The rules that keep this safe

| Point | Decision |
| --- | --- |
| Who | The host seat only. Anyone else gets `not_host` and the view is unchanged. |
| When | Only before the **first deal of the match** - not before each round. A match spans rounds and carries a score; changing Seven-Zero at round three would rewrite the rules of a contest already in progress. After that, `already_started`. |
| Broadcast | Every accepted change re-emits `room:state` to **every** member, host included. A guest watching the host toggle Jump-in should see it happen. |
| Rejoining | Covered by the above: `room:state` carries the whole view, so a reconnecting player receives the current rules with no extra path. |
| Restart | `game:restart` begins a new match. Check what it actually does - if it returns players to the lobby, configuration unlocks; if it deals immediately, it stays locked. Document whichever it is; do not guess. |
| Guest rendering | The same component, read-only. Not a second copy of the list - a divergent copy is how one of them ends up stale. |

## Interactions to get right

**The lock is checked when the event is handled, not when the button renders.** A host
can click Distribute and toggle a rule in the same breath; whichever arrives second
must lose. Hiding the control client-side is presentation, never the guard.

**`canStart` is not the lock.** It reports whether enough seats are filled. A room can
be un-startable and already dealt (someone left mid-match), and it can be startable
and untouched. Derive the lock from whether the match has begun.

**Blazing arms nothing from the lobby.** Changing `pace` before the deal only records
a number; the clock is armed by `RoomManager` at the deal, as today. If a change could
arm or re-arm a timer from the lobby, that is a bug.

## Client

`Home.tsx` is 396 lines and loses most of them. `Lobby.tsx` is 95 and roughly doubles.
Neither should end up carrying the rules copy twice - the rule list, its labels and its
explanations belong in one component used in both modes.

The explanations are what made the home screen a wall of text: four paragraphs on
permanent display. In the lobby they belong behind the same per-rule disclosure the
mockup shows, because there the reader has already chosen to look. The points table is
the exception, per the user: shown in full.

Mobile is the constraint that will actually bite. The lobby currently fits a phone;
after this it carries seats, rules, match settings and the points table. Measure it,
and if it overflows, the points table is what gets a scroll container - not the seats.

## Testing

- Socket: a non-host is refused; a change after the deal is refused; an accepted change
  reaches **every** member's `room:state`, not just the sender's; out-of-bounds values
  are refused by Zod with the same bounds as `room:create`; a rejoining player receives
  the current rules.
- Engine/room: the lock derives from the match having begun, not from `canStart` -
  build the case of an un-startable room that has already dealt.
- Client: the guest renders the rules read-only and cannot emit; the host's controls
  disappear once dealt; both catalogues carry every new key.
- e2e: two browsers, the host toggles a rule, the guest sees it change before the deal.
- Mutation: let a non-host configure; keep configuring after the deal; broadcast only to
  the sender; gate on `canStart` instead of on having dealt; drop the Zod bounds.
