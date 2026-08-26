import type { Color } from '@uno/engine'
import { contrastRatio } from './contrast.js'
import { BONE, COLOR_HEX, COLOR_VALUE, INK } from './palette.js'

/**
 * The four card faces, as data.
 *
 * A theme is a display preference, not a table option: it changes what one player
 * sees, so two people at the same table can run different ones and the game is
 * identical. Nothing here crosses the wire.
 *
 * The decisions live in this file rather than inside `Card.tsx` for the same reason
 * `palette.ts` exists - four variants inlined in a component that already draws a
 * card would be unreadable, and a value that differs per theme is a table entry,
 * not a branch. Only what needs a different *structure* is a branch in `Card.tsx`:
 * whether the oval is drawn at all, whether the panel is filled or outlined,
 * whether the numeral carries a glow.
 */
export const CARD_THEMES = ['poster', 'classic', 'flat', 'letterpress', 'neon'] as const

/**
 * Faces that exist but are not offered. Nothing about a hidden face is special at
 * render time - it carries a full spec like the rest - so the only thing hiding it
 * is its absence from the list the pickers and the cycler read.
 */
export const HIDDEN_CARD_THEMES = ['minuit'] as const

export const ALL_CARD_THEMES = [...CARD_THEMES, ...HIDDEN_CARD_THEMES] as const
export type CardTheme = (typeof ALL_CARD_THEMES)[number]

/**
 * What a player who has never opened this preference sees.
 *
 * `poster` rather than `classic`, which is a deliberate reversal. `classic` is the
 * printed card and its yellow numeral measures 1.67:1 - a fact about the real object,
 * recorded in the tests, and not something to ship as a default once there is a face
 * that clears the bar. The printed card stays on offer for anyone who wants it.
 */
export const DEFAULT_CARD_THEME: CardTheme = 'poster'

/**
 * A colour in both forms it is needed in: the custom property the browser paints,
 * and the value a contrast ratio can be computed from. See `palette.ts`.
 */
export type Paint = { css: string; hex: string }

/**
 * Where a piece of ink takes its colour from.
 *
 * `contrast` is the interesting one: it picks whichever of the theme's own two inks
 * reads better on the ground it will sit on. That is what lets the flat theme put a
 * white numeral on red and blue and a near-black one on green and yellow, which no
 * single choice could do - cream on yellow measures 1.7:1.
 */
export type InkSource = 'pigment' | 'contrast' | 'light' | 'dark'

export type CardThemeSpec = {
  /**
   * The card's outer edge - what keeps two cards apart in a hand.
   *
   * `'pigment'` for a face that has no edge of its own: the colour runs to the card's
   * border, and the gap between cards does the separating instead. Same spelling as
   * `ground` takes, so the two read as the same kind of decision.
   */
  stock: Paint | 'pigment'
  /** Whether the card's colour fills the panel or merely outlines it. */
  panel: 'fill' | 'stroke'
  /** Width of that outline in viewBox units. Ignored when the panel is filled. */
  panelStroke: number
  /** What fills the panel. `'pigment'` means the card's own colour. */
  ground: Paint | 'pigment'
  /** The rotated oval behind the central mark, or null for a face without one. */
  oval: Paint | null
  /** The theme's light ink, for `contrast` and `light`. */
  light: Paint
  /** The theme's dark ink, for `contrast` and `dark`. */
  dark: Paint
  /** Font stack for every glyph on the face. */
  font: string
  /** Numeral size in viewBox units. Every other glyph is scaled from it. */
  numeral: number
  /** Numeral weight. */
  weight: number
  /** Ink for the central mark. */
  faceInk: InkSource
  /** Ink for the two corner labels. */
  trimInk: InkSource
  /** Fill for the colourblind shape tokens, which no theme is allowed to drop. */
  tokenInk: InkSource
  /** An outline for those tokens, where a pale pigment on pale stock needs one. */
  tokenOutline: InkSource | null
  /** How a wild's four colours are drawn. */
  wild: 'wheel' | 'squares' | 'circles'
  /** What stands in for the card's colour on a wild, which has none. */
  wildPigment: Paint
  /** An outer glow behind the central mark, kept out of the glyph itself. */
  glow: { blur: number; opacity: number } | null
  /**
   * Where the mark sits: centred on the face, or dropped into the bottom-left corner
   * at poster scale, bleeding past the padding.
   *
   * A structural branch in `Card.tsx` rather than a colour, which is why it is a field
   * and not a derived value: a corner numeral needs the corner label out of its way,
   * and a face that guessed would print one on top of the other.
   */
  layout: 'centred' | 'corner'
}

/* Colours that exist only inside a card face. They are not furniture - nothing
   else on the page uses them - and a theme has to be able to compute a contrast
   ratio from them, so they live here as values rather than in `tokens.css`. */
const PAPER: Paint = { css: '#efe9db', hex: '#efe9db' }
const DARK: Paint = { css: '#0b1114', hex: '#0b1114' }
/* Flat's light ink is pure white rather than the printed cream. Measured: cream on
   the fixed red pigment reaches 4.42:1 and no ink choice on that ground clears 4.5,
   while white reaches 4.98:1. Flat is the theme that exists to be legible. */
const WHITE: Paint = { css: '#ffffff', hex: '#ffffff' }

export const CARD_THEME_SPEC: Record<CardTheme, CardThemeSpec> = {
  /* The editorial face: the pigment fills the card, the numeral drops into the
     bottom-left corner at poster scale and bleeds past the padding, and the shape
     token moves to the top-right where a fanned hand does not cover it. Ink chosen
     for contrast against the pigment, exactly as flat does, which is what lets the
     face that ships by default also be one that clears 4.5:1 on all four colours. */
  poster: {
    stock: 'pigment',
    panel: 'fill',
    panelStroke: 0,
    ground: 'pigment',
    oval: null,
    light: WHITE,
    dark: INK,
    font: 'var(--display)',
    /* Wholly inside the card, baseline at 150 of 168. It was 118 with the baseline UNDER
       the viewBox, which cut the bottom off every digit: a deliberate bleed on an
       artboard, and a rendering fault to the eye at hand size. Nothing sits in the
       bottom-right corner on this face, so the numeral has the whole bottom to itself. */
    numeral: 112,
    weight: 400,
    faceInk: 'contrast',
    trimInk: 'contrast',
    tokenInk: 'contrast',
    tokenOutline: null,
    wild: 'squares',
    wildPigment: INK,
    glow: null,
    layout: 'corner',
  },
  /* Today's card, to the pixel. A player who never opens the preference must not be
     able to tell that it exists, which is why this entry describes the face that
     was already there rather than an improved version of it. */
  classic: {
    stock: BONE,
    panel: 'fill',
    panelStroke: 0,
    ground: 'pigment',
    oval: BONE,
    light: BONE,
    dark: INK,
    font: 'var(--display)',
    numeral: 66,
    weight: 600,
    faceInk: 'pigment',
    trimInk: 'light',
    tokenInk: 'light',
    tokenOutline: null,
    wild: 'wheel',
    wildPigment: INK,
    glow: null,
    layout: 'centred',
  },
  /* No oval, a numeral 40% larger, and every piece of ink chosen for contrast
     against the pigment it sits on. The most legible of the four by measurement. */
  flat: {
    stock: BONE,
    panel: 'fill',
    panelStroke: 0,
    ground: 'pigment',
    oval: null,
    light: WHITE,
    dark: INK,
    font: 'var(--display)',
    numeral: 92,
    weight: 600,
    faceInk: 'contrast',
    trimInk: 'contrast',
    tokenInk: 'contrast',
    tokenOutline: null,
    wild: 'squares',
    wildPigment: INK,
    glow: null,
    layout: 'centred',
  },
  /* Paper stock and a stroked border instead of a filled panel: the colour is the
     frame, not the field. The tokens keep the pigment and gain an ink outline,
     because a yellow diamond on cream measures 1.55:1 and would be a shape nobody
     can see - which is the same as not having one. */
  letterpress: {
    stock: PAPER,
    panel: 'stroke',
    panelStroke: 3.5,
    ground: PAPER,
    oval: null,
    light: PAPER,
    dark: INK,
    font: "Georgia, 'Times New Roman', Times, serif",
    numeral: 72,
    weight: 600,
    faceInk: 'dark',
    trimInk: 'dark',
    tokenInk: 'pigment',
    tokenOutline: 'dark',
    wild: 'circles',
    wildPigment: INK,
    glow: null,
    layout: 'centred',
  },
  /* The one that had to be fixed before it could ship. It was first presented as
     the boldest of the four with an explicit caveat: the glow cost contrast and it
     was the least legible. Offering an option already known to be the weakest is a
     trap rather than a choice.
     Two changes make it the strongest instead. The numeral is cream on a near-black
     ground - 16.9:1, measured, against classic's 1.7:1 on yellow. And the glow is a
     blurred copy *behind* the glyph at half opacity rather than a shadow bleeding
     through it, so the glyph's own colour is what the eye receives; the worst case,
     a cream numeral against a fully lit yellow halo, still measures 5.1:1. */
  /* The register the set did not occupy: a printed card seen at night. Bone on a
     dark oval rather than neon's outlined glow, so the two are different faces
     rather than two settings of one. */
  minuit: {
    stock: DARK,
    panel: 'fill',
    ground: 'pigment',
    panelStroke: 0,
    oval: DARK,
    light: BONE,
    dark: INK,
    font: 'var(--display)',
    numeral: 74,
    weight: 400,
    faceInk: 'light',
    trimInk: 'light',
    tokenInk: 'light',
    tokenOutline: null,
    wild: 'squares',
    wildPigment: BONE,
    glow: null,
    layout: 'corner',
  },
  neon: {
    stock: DARK,
    panel: 'stroke',
    panelStroke: 3,
    ground: DARK,
    oval: null,
    light: BONE,
    dark: INK,
    font: 'var(--display)',
    numeral: 78,
    weight: 600,
    faceInk: 'light',
    trimInk: 'light',
    tokenInk: 'pigment',
    tokenOutline: null,
    wild: 'wheel',
    wildPigment: BONE,
    glow: { blur: 3, opacity: 0.5 },
    layout: 'centred',
  },
}

export const pigmentPaint = (color: Color): Paint => ({
  css: COLOR_VALUE[color],
  hex: COLOR_HEX[color],
})

/** Whichever of the theme's two inks reads better on `ground`. Measured, not guessed. */
export const legibleInkOn = (spec: CardThemeSpec, ground: Paint): Paint =>
  contrastRatio(spec.light.hex, ground.hex) >= contrastRatio(spec.dark.hex, ground.hex)
    ? spec.light
    : spec.dark

const resolveInk = (
  source: InkSource,
  spec: CardThemeSpec,
  ground: Paint,
  pigment: Paint,
): Paint => {
  switch (source) {
    case 'pigment':
      return pigment
    case 'light':
      return spec.light
    case 'dark':
      return spec.dark
    case 'contrast':
      return legibleInkOn(spec, ground)
  }
}

/** Every colour one card face needs, resolved. `Card.tsx` decides nothing itself. */
export type CardPaints = {
  /** The card's colour, or what stands in for it on a wild. */
  pigment: Paint
  stock: Paint
  /** What fills the panel. */
  ground: Paint
  /** The rotated oval, or null where the theme draws none. */
  oval: Paint | null
  /** What the central mark sits on: the oval where there is one, the panel where not. */
  faceGround: Paint
  /** Ink for the central mark. */
  face: Paint
  /** Ink for the corner labels. */
  trim: Paint
  /** Fill for the shape tokens. */
  token: Paint
  /** Outline for those tokens, or null. */
  tokenEdge: Paint | null
  /** Whichever ink survives on the face ground, for the +4 label inside a wild. */
  legible: Paint
}

/**
 * The card's outer edge, with `'pigment'` resolved.
 *
 * Exported because a card BACK has no pigment - it takes the ink instead - so it cannot
 * go through `cardPaints`, and a second copy of "what does 'pigment' mean here" is
 * exactly the duplication that let two representations of one colour drift apart before.
 */
export const stockOf = (spec: CardThemeSpec, pigment: Paint): Paint =>
  spec.stock === 'pigment' ? pigment : spec.stock

export function cardPaints(spec: CardThemeSpec, pigment: Paint): CardPaints {
  const ground = spec.ground === 'pigment' ? pigment : spec.ground
  const faceGround = spec.oval ?? ground
  return {
    pigment,
    stock: stockOf(spec, pigment),
    ground,
    oval: spec.oval,
    faceGround,
    face: resolveInk(spec.faceInk, spec, faceGround, pigment),
    trim: resolveInk(spec.trimInk, spec, ground, pigment),
    token: resolveInk(spec.tokenInk, spec, ground, pigment),
    tokenEdge:
      spec.tokenOutline === null ? null : resolveInk(spec.tokenOutline, spec, ground, pigment),
    legible: legibleInkOn(spec, faceGround),
  }
}

/**
 * The table's control is a cycler, so the order in `CARD_THEMES` is the order seen.
 * A hidden face joins the end of that order once found, leaving the familiar
 * sequence untouched, and a player who is not unlocked never lands on one.
 */
export function nextCardTheme(theme: CardTheme, unlocked = false): CardTheme {
  const ring = unlocked ? ALL_CARD_THEMES : CARD_THEMES
  const at = (ring as readonly CardTheme[]).indexOf(theme)
  // -1 covers a hidden face held by a player who is no longer unlocked: +1 lands on 0.
  return ring[(at + 1) % ring.length] ?? DEFAULT_CARD_THEME
}
