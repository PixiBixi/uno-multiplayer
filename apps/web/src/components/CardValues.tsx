import { buildDeck, cardPoints, type Card, type CardId } from '@uno/engine'

/**
 * What the cards are worth, read from the engine rather than written out here.
 *
 * A points table copied into help text is a table that goes quietly wrong the
 * first time the rule changes. Every number below is produced by calling
 * `cardPoints` on a representative card, so the page cannot disagree with the
 * scoring it describes — if it ever did, the tests comparing the two would fail
 * before a player ever saw it.
 */
const NUMBER_LOW: Card = { id: 'help-0' as CardId, kind: 'number', color: 'R', value: 0 }
const NUMBER_HIGH: Card = { id: 'help-9' as CardId, kind: 'number', color: 'R', value: 9 }
const SKIP: Card = { id: 'help-skip' as CardId, kind: 'skip', color: 'G' }
const REVERSE: Card = { id: 'help-reverse' as CardId, kind: 'reverse', color: 'B' }
const DRAW2: Card = { id: 'help-draw2' as CardId, kind: 'draw2', color: 'Y' }
const WILD: Card = { id: 'help-wild' as CardId, kind: 'wild' }
const WILD4: Card = { id: 'help-wild4' as CardId, kind: 'wild4' }

const ROWS: { label: string; value: string }[] = [
  {
    label: 'Number cards',
    value: `${String(cardPoints(NUMBER_LOW))}–${String(cardPoints(NUMBER_HIGH))}, their face value`,
  },
  { label: 'Skip', value: String(cardPoints(SKIP)) },
  { label: 'Reverse', value: String(cardPoints(REVERSE)) },
  { label: 'Draw Two', value: String(cardPoints(DRAW2)) },
  { label: 'Wild', value: String(cardPoints(WILD)) },
  { label: 'Wild Draw Four', value: String(cardPoints(WILD4)) },
]

/** Counted from the real deck, so it stays true if the deck ever changes. */
const DECK_TOTAL = buildDeck().reduce((sum, card) => sum + cardPoints(card), 0)

export function CardValues() {
  return (
    <details className="help">
      <summary className="help-summary">What are the cards worth?</summary>
      <div className="help-body">
        <p className="hint">
          Win a round and you score everything left in the other players’ hands. Nobody scores for
          the cards they were still holding.
        </p>

        <dl className="value-list">
          {ROWS.map((row) => (
            <div className="value-row" key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        <p className="hint">
          A full deck is <b>{DECK_TOTAL}</b> points. A round pays out only what the losers were
          still holding, so the same target takes far more rounds at two players than at four —
          worth knowing before picking one.
        </p>
      </div>
    </details>
  )
}
