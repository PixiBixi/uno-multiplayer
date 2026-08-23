# Card themes

Four card faces, chosen by each player. Preview on the home screen, a cycler on the
table.

## It is a display preference, not a table option

This is the whole reason it is cheap. A theme changes what **one player** sees;
two people at the same table can run different themes and the game is identical.

So it does **not** go through the protocol. No `TableRules`, no `room:create`
field, no socket test, no server surface. It lives in `localStorage` beside the
hand-sort mode and the mute flag, using the same defensive-read pattern in
`apps/web/src/lib/preferences.ts` - storage can be blocked outright, and losing a
preference must never break the page.

```ts
export type CardTheme = 'classic' | 'flat' | 'letterpress' | 'neon'
```

`classic` is the default, because it is what everybody already has.

## Where the theme decisions live

`Card.tsx` is already 226 lines. Four variants inside it would make it unreadable,
so each theme's decisions go in `apps/web/src/lib/card-themes.ts` and `Card.tsx`
reads them - the same shape as `palette.ts`, which exists for exactly this reason.

A theme is data, not a component: ground colour, ink colour, numeral font and size,
whether the oval is drawn, how the corner tokens are placed. Anything that needs a
different *structure* rather than different values (the flat theme has no oval; the
letterpress theme has a stroked border instead of a filled panel) is a small branch
in `Card.tsx` keyed on the theme, not a second copy of the component.

## Non-negotiable across all four

**The colourblind shape tokens stay.** Circle, square, triangle, diamond, drawn by
`ShapeToken` in `Card.tsx`. Colour is never the only signal, and that holds for the
letterpress theme where they are subtle and the neon theme where they glow. A theme
that drops them is not shippable.

**Every theme must be legible on the felt.** Which brings up the honest problem:

## The neon theme needs fixing before it ships

When these were first presented, neon was described as "the boldest" with an
explicit caveat - *the glow costs contrast, worst of the four for legibility*. If a
player can pick it, some will, and then the game is harder to read for them.

Offering an option already known to be the weakest is not a choice, it is a trap.
So before shipping: raise the numeral's contrast against the dark card, keep the
glow as an outer effect rather than something that bleeds into the glyph, and
measure the result rather than judging it by eye. A card face has to clear the same
bar as body text.

If it cannot be made to clear that bar, ship three themes and say why.

## Where the control goes

**Home screen** - four real miniature cards, clickable, beside the language chips.
You pick by looking, not by reading a name, which is why the mockups presented them
that way. Each preview renders the actual `Card` component so the preview cannot
drift from the thing it previews.

**Table** - a small cycler beside the mute toggle, stepping through the four. It is
a setting, not a move, so it belongs with the mute button rather than among the
controls a player reaches for under time pressure. Same 44px target, same quiet
opacity until hovered.

Both write the same preference, so switching in either place is visible in the
other.

## Testing

- `card-themes.ts` is data, so assert the boring things that rot: every theme has
  every field, no two themes are identical, and every theme keeps a shape token.
- `Card.tsx` renders under each theme with the same accessible label - the label is
  the game state and must not change with a display preference.
- The preference round-trips through storage, and an unknown stored value falls back
  to `classic` rather than to a blank card. The mute flag already does exactly this
  for the same reason.
- Contrast: measure the numeral against its ground for all four in a real browser,
  not by eye. This is the one that would otherwise ship broken.
- No socket test and no e2e spec: nothing crosses the wire.
