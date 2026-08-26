import { isWild, type Card as CardData, type Color } from '@uno/engine'
import { useId, type ReactNode } from 'react'
import {
  CARD_THEME_SPEC,
  cardPaints,
  pigmentPaint,
  type CardPaints,
  type CardTheme,
  type CardThemeSpec,
} from '../lib/card-themes.js'
import { useMessages, type Messages } from '../i18n/index.js'
import { COLOR_VALUE } from '../lib/palette.js'
import { useCardTheme } from './CardThemeProvider.js'

/**
 * Shape per pigment: the non-chromatic channel. Colour is the rule in UNO, not
 * decoration, so it cannot also be the only way to read a card. Around one man
 * in twelve has a red–green deficiency.
 *
 * This holds in all four themes. A theme decides what colour the token is drawn in
 * and whether it needs an outline to survive its ground; it does not get to decide
 * whether there is one.
 */
const SHAPE: Record<Color, 'circle' | 'triangle' | 'square' | 'diamond'> = {
  R: 'circle',
  G: 'triangle',
  B: 'square',
  Y: 'diamond',
}

/** The classic numeral, from which every other glyph on the face is scaled. */
const BASE_NUMERAL = 66
/** The classic "+2" against that numeral. Kept as a ratio so a theme scales both. */
const SMALL_RATIO = 46 / BASE_NUMERAL

/**
 * What a screen reader says about a card.
 *
 * The catalogue is a parameter, in the shape `describeEvent(event, nameOf, mySeat,
 * messages)` already uses: this is exported so it can be tested on its own, and an
 * exported function cannot read a context. Importing a catalogue here instead would
 * pin the language at build time and no control could change it.
 *
 * Two things this label is not. It is not the card *face*, so it does not change with
 * the card theme - that is a display preference and this is game state, asserted for
 * all four faces in `Card.test.tsx`. And it is not assembled here from a colour and a
 * noun: `messages.card` owns the whole name, because "Red 7" and "Rouge 7" agree only
 * by luck and "Wild draw four" and "+4" do not agree at all.
 */
export function cardLabel(card: CardData, disabled: boolean, messages: Messages): string {
  return disabled ? messages.cardUnplayable(card) : messages.card(card)
}

function cornerLabel(card: CardData): string {
  switch (card.kind) {
    case 'number':
      return String(card.value)
    case 'draw2':
      return '+2'
    case 'wild4':
      return '+4'
    case 'skip':
      return '⊘'
    case 'reverse':
      return '⇅'
    case 'wild':
      return '◉'
  }
}

/**
 * The corner mark for a card that has no colour: the four pigments, quartered.
 *
 * A wild used to borrow the red circle, which says "red" on the one card in the deck
 * whose whole point is that it is not any colour yet. Four squares say what it is, and
 * they are the same four the colour picker offers a moment later.
 */
function WildToken({ x, y }: { x: number; y: number }) {
  const r = 5.5
  const quarters: [number, number, string][] = [
    [x - r, y - r, COLOR_VALUE.R],
    [x, y - r, COLOR_VALUE.B],
    [x - r, y, COLOR_VALUE.G],
    [x, y, COLOR_VALUE.Y],
  ]
  return (
    <g data-token="wild">
      {quarters.map(([qx, qy, paint]) => (
        <rect key={paint} x={qx} y={qy} width={r} height={r} fill={paint} />
      ))}
    </g>
  )
}

function ShapeToken({
  color,
  x,
  y,
  fill,
  outline,
}: {
  color: Color
  x: number
  y: number
  fill: string
  outline: string | null
}) {
  const shape = SHAPE[color]
  const r = 5.5
  /* An outline is how a pale pigment survives pale stock: the letterpress theme
     keeps the colour and edges the shape, rather than dropping either. */
  const edge = outline === null ? {} : { stroke: outline, strokeWidth: 0.9 }
  if (shape === 'circle') {
    return <circle cx={x} cy={y} r={r} fill={fill} {...edge} data-token={shape} />
  }
  if (shape === 'square') {
    return (
      <rect
        x={x - r}
        y={y - r}
        width={r * 2}
        height={r * 2}
        rx={1}
        fill={fill}
        {...edge}
        data-token={shape}
      />
    )
  }
  if (shape === 'triangle') {
    return (
      <path
        d={`M${x} ${y - r}L${x + r} ${y + r * 0.8}H${x - r}Z`}
        fill={fill}
        {...edge}
        data-token={shape}
      />
    )
  }
  return (
    <path
      d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`}
      fill={fill}
      {...edge}
      data-token={shape}
    />
  )
}

/**
 * A wild's four colours. Every theme shows all four - that is what says "wild" -
 * but the shape they are drawn in belongs to the theme: the printed wheel, four
 * squares on the flat face, four dots on paper.
 */
function WildMark({
  kind,
  cx,
  cy,
  r,
  decorated,
}: {
  kind: CardThemeSpec['wild']
  cx: number
  cy: number
  r: number
  decorated: boolean
}) {
  const mark = (index: number) => (decorated ? { 'data-quadrant': index } : {})

  if (kind === 'wheel') {
    const wedges: Array<[string, string]> = [
      [`M${cx} ${cy} L${cx} ${cy - r} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z`, COLOR_VALUE.R],
      [`M${cx} ${cy} L${cx + r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy + r} Z`, COLOR_VALUE.Y],
      [`M${cx} ${cy} L${cx} ${cy + r} A${r} ${r} 0 0 1 ${cx - r} ${cy} Z`, COLOR_VALUE.G],
      [`M${cx} ${cy} L${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy - r} Z`, COLOR_VALUE.B],
    ]
    return (
      <>
        {wedges.map(([d, fill], index) => (
          <path key={index} d={d} fill={fill} {...mark(index)} />
        ))}
      </>
    )
  }

  /* Same reading order as the wheel - red north-east, then clockwise - so the four
     colours never appear in two different arrangements. */
  const offset = r * (kind === 'squares' ? 0.5 : 0.52)
  const spots: Array<[number, number, string]> = [
    [cx + offset, cy - offset, COLOR_VALUE.R],
    [cx + offset, cy + offset, COLOR_VALUE.Y],
    [cx - offset, cy + offset, COLOR_VALUE.G],
    [cx - offset, cy - offset, COLOR_VALUE.B],
  ]

  if (kind === 'squares') {
    const side = r * 0.85
    return (
      <>
        {spots.map(([x, y, fill], index) => (
          <rect
            key={index}
            x={x - side / 2}
            y={y - side / 2}
            width={side}
            height={side}
            rx={1.5}
            fill={fill}
            {...mark(index)}
          />
        ))}
      </>
    )
  }

  return (
    <>
      {spots.map(([x, y, fill], index) => (
        <circle key={index} cx={x} cy={y} r={r * 0.42} fill={fill} {...mark(index)} />
      ))}
    </>
  )
}

/**
 * Every glyph is centred on the face centre (60, 84) with dominantBaseline, never
 * by guessing a baseline offset - cap height differs per glyph, and it differs
 * again between the display face and the serif one letterpress uses.
 *
 * `decorated` is false for the copy a glowing theme draws behind the real one. The
 * blurred copy must not carry the data attributes the tests and the styles hang
 * off, or a neon card would appear to have eight quadrants and two numerals.
 */
function FaceMark({
  card,
  spec,
  paints,
  fill,
  decorated,
}: {
  card: CardData
  spec: CardThemeSpec
  paints: CardPaints
  fill: string
  decorated: boolean
}) {
  const centred = { textAnchor: 'middle' as const, dominantBaseline: 'central' as const }
  const scale = spec.numeral / BASE_NUMERAL
  /* The corner face hangs its baseline BELOW the viewBox, so the bottom of the glyph
     is clipped by the card edge. That crop is the design: a numeral that stops short
     of the edge reads as a label, and one that runs off it reads as printing. */
  const corner = spec.layout === 'corner'
  const mark = corner
    ? { x: 10, y: 150, textAnchor: 'start' as const, dominantBaseline: 'alphabetic' as const }
    : { x: 60, y: 84, ...centred }
  const stroke = {
    stroke: fill,
    strokeWidth: 9,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  /* The action glyphs are drawn from fixed coordinates around the face centre, so a
     theme with a bigger numeral scales them about that centre rather than restating
     every path. At scale 1 the transform is omitted entirely: the classic face has
     to stay byte for byte what it was. */
  const glyphCentre = corner ? { x: 46, y: 116 } : { x: 60, y: 84 }
  const scaled = (children: ReactNode) =>
    scale === 1 && !corner ? (
      <g {...stroke}>{children}</g>
    ) : (
      <g
        {...stroke}
        transform={`translate(${String(glyphCentre.x)} ${String(glyphCentre.y)}) scale(${String(scale)}) translate(-60 -84)`}
      >
        {children}
      </g>
    )

  switch (card.kind) {
    case 'number':
      return (
        <text
          {...mark}
          fontSize={spec.numeral}
          fontWeight={spec.weight}
          fill={fill}
          {...(decorated ? { 'data-numeral': '' } : {})}
        >
          {card.value}
        </text>
      )
    case 'draw2':
      return (
        <text
          {...mark}
          fontSize={Math.round(spec.numeral * SMALL_RATIO)}
          fontWeight={spec.weight}
          fill={fill}
          {...(decorated ? { 'data-numeral': '' } : {})}
        >
          +2
        </text>
      )
    case 'skip':
      return scaled(
        <>
          <circle cx={60} cy={84} r={23} />
          <line x1={44} y1={68} x2={76} y2={100} />
        </>,
      )
    /* Two bold opposing arrows, the way the printed card does it. A pair of thin
       arcs read as squiggles at hand size. */
    case 'reverse':
      return scaled(
        <>
          <path d="M47 105V65" />
          <path d="M38 74L47 63L56 74" />
          <path d="M73 63V103" />
          <path d="M64 94L73 105L82 94" />
        </>,
      )
    case 'wild':
      return (
        <WildMark
          kind={spec.wild}
          cx={glyphCentre.x}
          cy={glyphCentre.y}
          r={corner ? 32 : 26}
          decorated={decorated}
        />
      )
    /* The +4 label sits INSIDE the face, in whichever ink survives there. Placed
       below it, ink on ink would make it vanish off the card - and on the neon face
       ink on near-black would do the same. */
    case 'wild4':
      return (
        <>
          {/* The corner face says "+4" once, at poster scale, below - so the wheel is the
              only thing in the middle and there is no second label to read. */}
          {!corner && <WildMark kind={spec.wild} cx={78} cy={74} r={18} decorated={decorated} />}
          <text
            {...(corner
              ? { ...mark, fontSize: Math.round(spec.numeral * SMALL_RATIO) }
              : { x: 40, y: 96, ...centred, fontSize: 26 })}
            fontWeight={corner ? spec.weight : 600}
            fill={corner ? fill : paints.legible.css}
            {...(decorated ? { 'data-plusfour': '' } : {})}
          >
            +4
          </text>
        </>
      )
  }
}

type CardProps = {
  card: CardData
  onPlay?: () => void
  disabled?: boolean
  /**
   * Overrides the player's chosen theme. Only the home screen's previews pass it,
   * so that each preview can show the face it offers by rendering the real card -
   * a preview drawn any other way is a preview that can drift from the thing it
   * previews.
   */
  theme?: CardTheme
}

export function Card({ card, onPlay, disabled = false, theme }: CardProps) {
  const chosen = useCardTheme()
  const messages = useMessages()
  /* React ids carry colons, which are legal in a fragment but a poor bet inside a
     url() reference. The glow filter needs a document-unique id because a hand is a
     dozen of these. */
  const glowId = `glow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  const spec = CARD_THEME_SPEC[theme ?? chosen]
  const wild = isWild(card)
  const pigment = wild ? spec.wildPigment : pigmentPaint(card.color)
  const paints = cardPaints(spec, pigment)
  const tokenColor: Color = wild ? 'R' : card.color
  const label = cardLabel(card, disabled, messages)
  const corner = cornerLabel(card)
  /* Named here as well as in `FaceMark`: the layout decides where the mark goes AND
     whether the trim is mirrored, because those are the same decision. */
  const cornerFace = spec.layout === 'corner'

  const inset = spec.panel === 'stroke' ? spec.panelStroke / 2 : 0
  const outlined =
    spec.panel === 'stroke'
      ? { stroke: paints.pigment.css, strokeWidth: spec.panelStroke }
      : undefined
  const panel = {
    x: 6 + inset,
    y: 6 + inset,
    width: 108 - inset * 2,
    height: 156 - inset * 2,
    rx: 7,
  }

  const face = (
    <svg
      viewBox="0 0 120 168"
      role="img"
      aria-label={label}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      fontFamily={spec.font}
    >
      {spec.glow !== null && (
        <defs>
          {/* Over the whole card in user space: the default filter region is a
              percentage of the bounding box and clips a wide blur. */}
          <filter id={glowId} filterUnits="userSpaceOnUse" x={0} y={0} width={120} height={168}>
            <feGaussianBlur stdDeviation={spec.glow.blur} />
          </filter>
        </defs>
      )}

      <rect x={0} y={0} width={120} height={168} rx={11} fill={paints.stock.css} />

      {spec.glow !== null && outlined !== undefined && (
        <rect
          {...panel}
          fill="none"
          {...outlined}
          filter={`url(#${glowId})`}
          opacity={spec.glow.opacity}
        />
      )}

      <rect {...panel} fill={paints.ground.css} {...outlined} data-panel="" />

      {paints.oval !== null && (
        <ellipse
          cx={60}
          cy={84}
          rx={52}
          ry={30}
          fill={paints.oval.css}
          transform="rotate(-27 60 84)"
        />
      )}

      {/* The glow is a blurred copy BEHIND the glyph, never a shadow through it.
          That is the whole reason the neon face can be both bright and legible: the
          colour the eye receives inside the numeral is the numeral's own. */}
      {spec.glow !== null && (
        <g filter={`url(#${glowId})`} opacity={spec.glow.opacity} data-glow="">
          <FaceMark
            card={card}
            spec={spec}
            paints={paints}
            fill={paints.pigment.css}
            decorated={false}
          />
        </g>
      )}

      <FaceMark card={card} spec={spec} paints={paints} fill={paints.face.css} decorated />

      <g
        fontSize={17}
        fontWeight={600}
        fill={paints.trim.css}
        textAnchor="middle"
        dominantBaseline="central"
      >
        <text x={32} y={26}>
          {corner}
        </text>
        {/* Twice on a printed face, the second pair rotated about the centre, so the card
            reads either way up.

            Once on the corner face, and not because the two would overlap - measured, they
            clear each other by eight units. They are two different languages on one card:
            a numeral set as a poster in one corner, and the mirrored trim of a printed
            deck in the next one along. Side by side at the same height they read as two
            marks competing rather than as one design, which is what a small upside-down
            digit beside a large upright one looks like. */}
        {!cornerFace && (
          <g transform="rotate(180 60 84)">
            <text x={32} y={26}>
              {corner}
            </text>
          </g>
        )}
      </g>
      {/* Top-RIGHT on the corner face: the label has the top-left corner, the numeral has
          the bottom, and a fanned hand covers neither. */}
      {wild ? (
        <WildToken x={cornerFace ? 100 : 20} y={22} />
      ) : (
        <ShapeToken
          color={tokenColor}
          x={cornerFace ? 100 : 20}
          y={22}
          fill={paints.token.css}
          outline={paints.tokenEdge?.css ?? null}
        />
      )}
      {!cornerFace && (
        <g transform="rotate(180 60 84)">
          {wild ? (
            <WildToken x={20} y={22} />
          ) : (
            <ShapeToken
              color={tokenColor}
              x={20}
              y={22}
              fill={paints.token.css}
              outline={paints.tokenEdge?.css ?? null}
            />
          )}
        </g>
      )}
    </svg>
  )

  if (onPlay === undefined) return face

  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={disabled}
      aria-label={label}
      className="card-button"
    >
      {face}
    </button>
  )
}
