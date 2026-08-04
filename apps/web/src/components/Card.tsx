import type { Card as CardData, Color } from '@uno/engine'

const PIGMENT: Record<Color, string> = {
  R: 'var(--red)',
  G: 'var(--green)',
  B: 'var(--blue)',
  Y: 'var(--yellow)',
}
const BONE = 'var(--bone)'
const INK = 'var(--ink)'
const COLOR_NAME: Record<Color, string> = { R: 'Red', G: 'Green', B: 'Blue', Y: 'Yellow' }

/**
 * Shape per pigment: the non-chromatic channel. Colour is the rule in UNO, not
 * decoration, so it cannot also be the only way to read a card. Around one man
 * in twelve has a red–green deficiency.
 */
const SHAPE: Record<Color, 'circle' | 'triangle' | 'square' | 'diamond'> = {
  R: 'circle',
  G: 'triangle',
  B: 'square',
  Y: 'diamond',
}

type WildCard = Extract<CardData, { kind: 'wild' | 'wild4' }>

/**
 * A type predicate, not a boolean alias: `const isWild = card.kind === 'wild' ||
 * card.kind === 'wild4'` does not narrow `card` in the branches that follow, so
 * reading `card.color` afterwards fails to compile.
 */
function isWildCard(card: CardData): card is WildCard {
  return card.kind === 'wild' || card.kind === 'wild4'
}

export function cardLabel(card: CardData): string {
  switch (card.kind) {
    case 'number':
      return `${COLOR_NAME[card.color]} ${card.value}`
    case 'skip':
      return `${COLOR_NAME[card.color]} skip`
    case 'reverse':
      return `${COLOR_NAME[card.color]} reverse`
    case 'draw2':
      return `${COLOR_NAME[card.color]} draw two`
    case 'wild':
      return 'Wild'
    case 'wild4':
      return 'Wild draw four'
  }
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

function ShapeToken({ color, x, y }: { color: Color; x: number; y: number }) {
  const shape = SHAPE[color]
  const r = 5.5
  if (shape === 'circle') return <circle cx={x} cy={y} r={r} fill={BONE} data-token={shape} />
  if (shape === 'square') {
    return (
      <rect
        x={x - r}
        y={y - r}
        width={r * 2}
        height={r * 2}
        rx={1}
        fill={BONE}
        data-token={shape}
      />
    )
  }
  if (shape === 'triangle') {
    return (
      <path d={`M${x} ${y - r}L${x + r} ${y + r * 0.8}H${x - r}Z`} fill={BONE} data-token={shape} />
    )
  }
  return (
    <path
      d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`}
      fill={BONE}
      data-token={shape}
    />
  )
}

function Quadrants({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const wedges: Array<[string, string]> = [
    [`M${cx} ${cy} L${cx} ${cy - r} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z`, PIGMENT.R],
    [`M${cx} ${cy} L${cx + r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy + r} Z`, PIGMENT.Y],
    [`M${cx} ${cy} L${cx} ${cy + r} A${r} ${r} 0 0 1 ${cx - r} ${cy} Z`, PIGMENT.G],
    [`M${cx} ${cy} L${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy - r} Z`, PIGMENT.B],
  ]
  return (
    <>
      {wedges.map(([d, fill], index) => (
        <path key={index} d={d} fill={fill} data-quadrant={index} />
      ))}
    </>
  )
}

/**
 * Every glyph is centred on the ellipse centre (60, 84) with dominantBaseline,
 * never by guessing a baseline offset — cap height differs per glyph.
 */
function FaceMark({ card, fill }: { card: CardData; fill: string }) {
  const centred = { textAnchor: 'middle' as const, dominantBaseline: 'central' as const }
  const stroke = {
    stroke: fill,
    strokeWidth: 9,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (card.kind) {
    case 'number':
      return (
        <text x={60} y={84} {...centred} fontSize={66} fontWeight={600} fill={fill}>
          {card.value}
        </text>
      )
    case 'draw2':
      return (
        <text x={60} y={84} {...centred} fontSize={46} fontWeight={600} fill={fill}>
          +2
        </text>
      )
    case 'skip':
      return (
        <g {...stroke}>
          <circle cx={60} cy={84} r={23} />
          <line x1={43} y1={67} x2={77} y2={101} />
        </g>
      )
    /* Two bold opposing arrows, the way the printed card does it. A pair of thin
       arcs read as squiggles at hand size. */
    case 'reverse':
      return (
        <g {...stroke}>
          <path d="M47 105V65" />
          <path d="M38 74L47 63L56 74" />
          <path d="M73 63V103" />
          <path d="M64 94L73 105L82 94" />
        </g>
      )
    case 'wild':
      return <Quadrants cx={60} cy={84} r={26} />
    /* The +4 label sits INSIDE the bone ellipse. Placed below it, ink on ink
       would make it vanish off the card. */
    case 'wild4':
      return (
        <>
          <Quadrants cx={60} cy={71} r={19} />
          <text
            x={60}
            y={107}
            {...centred}
            fontSize={26}
            fontWeight={600}
            fill={INK}
            data-plusfour=""
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
}

export function Card({ card, onPlay, disabled = false }: CardProps) {
  const wild = isWildCard(card)
  const pigment = wild ? INK : PIGMENT[card.color]
  const faceFill = wild ? BONE : pigment
  const tokenColor: Color = wild ? 'R' : card.color
  const label = disabled ? `${cardLabel(card)} — not playable this turn` : cardLabel(card)
  const corner = cornerLabel(card)

  const face = (
    <svg
      viewBox="0 0 120 168"
      role="img"
      aria-label={label}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      fontFamily="var(--display)"
    >
      <rect x={0} y={0} width={120} height={168} rx={11} fill={BONE} />
      <rect x={6} y={6} width={108} height={156} rx={7} fill={pigment} />
      <ellipse cx={60} cy={84} rx={52} ry={30} fill={BONE} transform="rotate(-27 60 84)" />
      <FaceMark card={card} fill={faceFill} />
      <g fontSize={17} fontWeight={600} fill={BONE} textAnchor="middle" dominantBaseline="central">
        <text x={32} y={26}>
          {corner}
        </text>
        {/* The bottom-right marks are the top-left marks rotated about the card
            centre — the way a real card is printed. */}
        <g transform="rotate(180 60 84)">
          <text x={32} y={26}>
            {corner}
          </text>
        </g>
      </g>
      <ShapeToken color={tokenColor} x={20} y={22} />
      <g transform="rotate(180 60 84)">
        <ShapeToken color={tokenColor} x={20} y={22} />
      </g>
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
